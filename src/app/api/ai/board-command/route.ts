import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  buildDeterministicBoardCommandResponse,
  buildSwotAssistantMessage,
  buildStubBoardCommandResponse,
  detectBoardCommandIntent,
  MCP_TEMPLATE_TIMEOUT_MS,
  parseBoardCommandRequest
} from "@/features/ai/board-command";
import {
  AI_ROUTE_TIMEOUT_MS,
  acquireBoardCommandLock,
  checkUserRateLimit,
  releaseBoardCommandLock,
  validateTemplatePlan,
  withTimeout
} from "@/features/ai/guardrails";
import { callCommandPlanTool, callTemplateInstantiateTool } from "@/features/ai/mcp/template-mcp-client";
import { flushLangfuseClient } from "@/features/ai/observability/langfuse-client";
import { createAiTraceRun } from "@/features/ai/observability/trace-run";
import { planDeterministicCommand } from "@/features/ai/commands/deterministic-command-planner";
import { instantiateLocalTemplate } from "@/features/ai/templates/local-template-provider";
import { SWOT_TEMPLATE_ID } from "@/features/ai/templates/template-types";
import { BoardToolExecutor } from "@/features/ai/tools/board-tools";
import type { BoardBounds, BoardObjectSnapshot } from "@/features/ai/types";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/server/auth/require-user";
import {
  canUserEditBoard,
  canUserReadBoard,
  parseBoardDoc
} from "@/server/boards/board-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAiAuditEnabled(): boolean {
  return process.env.AI_AUDIT_LOG_ENABLED === "true";
}

function getInternalMcpToken(): string | null {
  const value = process.env.MCP_INTERNAL_TOKEN?.trim();
  return value && value.length > 0 ? value : null;
}

function getDebugMessage(error: unknown): string | undefined {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return undefined;
}

function createHttpError(status: number, message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function toBoardBounds(objects: BoardObjectSnapshot[]): BoardBounds | null {
  if (objects.length === 0) {
    return null;
  }

  const left = Math.min(...objects.map((objectItem) => objectItem.x));
  const top = Math.min(...objects.map((objectItem) => objectItem.y));
  const right = Math.max(
    ...objects.map((objectItem) => objectItem.x + objectItem.width)
  );
  const bottom = Math.max(
    ...objects.map((objectItem) => objectItem.y + objectItem.height)
  );

  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

async function writeAiAuditLogIfEnabled(options: {
  boardId: string;
  userId: string;
  message: string;
  traceId: string;
  fallbackUsed: boolean;
  mcpUsed: boolean;
  toolCalls: number;
  objectsCreated: number;
  intent: string;
}): Promise<void> {
  if (!isAiAuditEnabled()) {
    return;
  }

  await getFirebaseAdminDb()
    .collection("boards")
    .doc(options.boardId)
    .collection("aiRuns")
    .add({
      userId: options.userId,
      message: options.message,
      traceId: options.traceId,
      intent: options.intent,
      fallbackUsed: options.fallbackUsed,
      mcpUsed: options.mcpUsed,
      toolCalls: options.toolCalls,
      objectsCreated: options.objectsCreated,
      createdAt: FieldValue.serverTimestamp()
    });
}

export async function POST(request: NextRequest) {
  let activeTrace:
    | ReturnType<typeof createAiTraceRun>
    | null = null;
  let boardLockId: string | null = null;

  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsedPayload = parseBoardCommandRequest(payload);
    if (!parsedPayload) {
      return NextResponse.json(
        { error: "Invalid board command payload." },
        { status: 400 }
      );
    }

    const user = await requireUser(request);
    const boardSnapshot = await getFirebaseAdminDb()
      .collection("boards")
      .doc(parsedPayload.boardId)
      .get();

    if (!boardSnapshot.exists) {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    const board = parseBoardDoc(boardSnapshot.data());
    if (!board) {
      return NextResponse.json({ error: "Invalid board data." }, { status: 500 });
    }

    if (!canUserReadBoard(board, user.uid)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const intent = detectBoardCommandIntent(parsedPayload.message);
    const canEdit = canUserEditBoard(board, user.uid);

    if (intent === "stub" && !canEdit) {
      const traceId = randomUUID();
      activeTrace = createAiTraceRun({
        traceName: "board-command",
        traceId,
        userId: user.uid,
        boardId: parsedPayload.boardId,
        message: parsedPayload.message,
        metadata: {
          intent
        }
      });

      const response = buildStubBoardCommandResponse({
        message: parsedPayload.message,
        canEdit
      });
      const responseWithTrace = {
        ...response,
        traceId
      };
      const responseSpan = activeTrace.startSpan("ai.response.sent", {
        status: 200,
        provider: response.provider
      });
      responseSpan.end({
        traceId
      });
      activeTrace.finishSuccess({
        fallbackUsed: false,
        mcpUsed: false,
        mode: "stub"
      });
      return NextResponse.json(responseWithTrace);
    }

    if (intent === "stub" && canEdit) {
      const rateLimitResult = checkUserRateLimit(user.uid);
      if (!rateLimitResult.ok) {
        return NextResponse.json(
          { error: rateLimitResult.error },
          { status: rateLimitResult.status }
        );
      }

      const lockResult = acquireBoardCommandLock(parsedPayload.boardId);
      if (!lockResult.ok) {
        return NextResponse.json({ error: lockResult.error }, { status: lockResult.status });
      }
      boardLockId = parsedPayload.boardId;

      const traceId = randomUUID();
      activeTrace = createAiTraceRun({
        traceName: "board-command",
        traceId,
        userId: user.uid,
        boardId: parsedPayload.boardId,
        message: parsedPayload.message,
        metadata: {
          intent: "deterministic-command-planner"
        }
      });

      const response = await withTimeout(
        (async () => {
          const executor = new BoardToolExecutor({
            boardId: parsedPayload.boardId,
            userId: user.uid
          });

          const stateSpan = activeTrace.startSpan("ai.request.received", {
            selectedObjectCount: parsedPayload.selectedObjectIds?.length ?? 0
          });
          const boardObjects = await executor.getBoardState();
          stateSpan.end({
            existingObjectCount: boardObjects.length
          });

          let plannerResult;
          let fallbackUsed = false;
          let mcpUsed = true;
          const selectedObjectIds = parsedPayload.selectedObjectIds ?? [];

          const mcpSpan = activeTrace.startSpan("mcp.call", {
            endpoint: "/api/mcp/templates",
            tool: "command.plan"
          });
          try {
            const token = getInternalMcpToken();
            if (!token) {
              throw new Error("MCP_INTERNAL_TOKEN is missing.");
            }

            plannerResult = await callCommandPlanTool({
              endpointUrl: new URL("/api/mcp/templates", request.nextUrl.origin),
              internalToken: token,
              timeoutMs: MCP_TEMPLATE_TIMEOUT_MS,
              message: parsedPayload.message,
              selectedObjectIds,
              boardState: boardObjects
            });
            mcpSpan.end({
              fallbackUsed: false
            });
          } catch (error) {
            fallbackUsed = true;
            mcpUsed = false;
            mcpSpan.fail("MCP command planner failed.", {
              reason: getDebugMessage(error) ?? "Unknown error"
            });
            plannerResult = planDeterministicCommand({
              message: parsedPayload.message,
              boardState: boardObjects,
              selectedObjectIds
            });
          }

          const intentSpan = activeTrace.startSpan("ai.intent.detected", {
            intent: plannerResult.intent
          });
          intentSpan.end({
            deterministic: true,
            planned: plannerResult.planned
          });

          if (!plannerResult.planned) {
            const payload = buildDeterministicBoardCommandResponse({
              assistantMessage: plannerResult.assistantMessage,
              traceId,
              execution: {
                intent: plannerResult.intent,
                mode: "deterministic",
                mcpUsed,
                fallbackUsed,
                toolCalls: 0,
                objectsCreated: 0
              }
            });

            const responseSpan = activeTrace.startSpan("ai.response.sent", {
              status: 200,
              provider: payload.provider
            });
            responseSpan.end({
              traceId: payload.traceId ?? null
            });
            activeTrace.finishSuccess({
              intent: plannerResult.intent,
              planned: false,
              mcpUsed,
              fallbackUsed
            });
            return payload;
          }

          const validation = validateTemplatePlan(plannerResult.plan);
          if (!validation.ok) {
            throw createHttpError(validation.status, validation.error);
          }

          const executeSpan = activeTrace.startSpan("tool.execute", {
            operationCount: plannerResult.plan.operations.length
          });
          const executionResult = await executor.executeTemplatePlan(plannerResult.plan);
          executeSpan.end({
            toolCalls: executionResult.results.length
          });

          const commitSpan = activeTrace.startSpan("board.write.commit", {
            operationCount: plannerResult.plan.operations.length
          });
          commitSpan.end({
            createdObjectCount: executionResult.createdObjectIds.length
          });

          const payload = buildDeterministicBoardCommandResponse({
            assistantMessage: plannerResult.assistantMessage,
            traceId,
            execution: {
              intent: plannerResult.intent,
              mode: "deterministic",
              mcpUsed,
              fallbackUsed,
              toolCalls: executionResult.results.length,
              objectsCreated: executionResult.createdObjectIds.length
            }
          });

          await writeAiAuditLogIfEnabled({
            boardId: parsedPayload.boardId,
            userId: user.uid,
            message: parsedPayload.message,
            traceId,
            fallbackUsed,
            mcpUsed,
            toolCalls: executionResult.results.length,
            objectsCreated: executionResult.createdObjectIds.length,
            intent: plannerResult.intent
          });

          const responseSpan = activeTrace.startSpan("ai.response.sent", {
            status: 200,
            provider: payload.provider
          });
          responseSpan.end({
            traceId: payload.traceId ?? null
          });

          activeTrace.finishSuccess({
            intent: plannerResult.intent,
            toolCalls: executionResult.results.length,
            objectsCreated: executionResult.createdObjectIds.length,
            fallbackUsed,
            mcpUsed
          });

          return payload;
        })(),
        AI_ROUTE_TIMEOUT_MS,
        "AI command timed out."
      );

      return NextResponse.json(response);
    }

    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have edit access for AI mutation commands." },
        { status: 403 }
      );
    }

    const rateLimitResult = checkUserRateLimit(user.uid);
    if (!rateLimitResult.ok) {
      return NextResponse.json({ error: rateLimitResult.error }, { status: rateLimitResult.status });
    }

    const lockResult = acquireBoardCommandLock(parsedPayload.boardId);
    if (!lockResult.ok) {
      return NextResponse.json({ error: lockResult.error }, { status: lockResult.status });
    }
    boardLockId = parsedPayload.boardId;

    const traceId = randomUUID();
    activeTrace = createAiTraceRun({
      traceName: "board-command",
      traceId,
      userId: user.uid,
      boardId: parsedPayload.boardId,
      message: parsedPayload.message,
      metadata: {
        intent
      }
    });

    const response = await withTimeout(
      (async () => {
        const executor = new BoardToolExecutor({
          boardId: parsedPayload.boardId,
          userId: user.uid
        });

        const stateSpan = activeTrace.startSpan("ai.request.received", {
          selectedObjectCount: parsedPayload.selectedObjectIds?.length ?? 0
        });
        const boardObjects = await executor.getBoardState();
        stateSpan.end({
          existingObjectCount: boardObjects.length
        });

        const intentSpan = activeTrace.startSpan("ai.intent.detected", {
          intent
        });
        intentSpan.end({
          deterministic: true
        });

        const templateInput = {
          templateId: SWOT_TEMPLATE_ID,
          boardBounds: toBoardBounds(boardObjects),
          selectedObjectIds: parsedPayload.selectedObjectIds ?? [],
          existingObjectCount: boardObjects.length
        };

        let fallbackUsed = false;
        let mcpUsed = true;
        let templateOutput;

        const mcpSpan = activeTrace.startSpan("mcp.call", {
          endpoint: "/api/mcp/templates",
          templateId: templateInput.templateId
        });
        try {
          const token = getInternalMcpToken();
          if (!token) {
            throw new Error("MCP_INTERNAL_TOKEN is missing.");
          }

          templateOutput = await callTemplateInstantiateTool({
            endpointUrl: new URL("/api/mcp/templates", request.nextUrl.origin),
            internalToken: token,
            timeoutMs: MCP_TEMPLATE_TIMEOUT_MS,
            input: templateInput
          });
          mcpSpan.end({
            fallbackUsed: false
          });
        } catch (error) {
          fallbackUsed = true;
          mcpUsed = false;
          mcpSpan.fail("MCP template call failed.", {
            reason: getDebugMessage(error) ?? "Unknown error"
          });
          templateOutput = instantiateLocalTemplate(templateInput);
        }

        const validation = validateTemplatePlan(templateOutput.plan);
        if (!validation.ok) {
          throw createHttpError(validation.status, validation.error);
        }

        const executeSpan = activeTrace.startSpan("tool.execute", {
          operationCount: templateOutput.plan.operations.length
        });
        const executionResult = await executor.executeTemplatePlan(templateOutput.plan);
        executeSpan.end({
          toolCalls: executionResult.results.length
        });

        const commitSpan = activeTrace.startSpan("board.write.commit", {
          operationCount: templateOutput.plan.operations.length
        });
        commitSpan.end({
          createdObjectCount: executionResult.createdObjectIds.length
        });

        const assistantMessage = buildSwotAssistantMessage({
          fallbackUsed,
          objectsCreated: executionResult.createdObjectIds.length
        });

        const payload = buildDeterministicBoardCommandResponse({
          assistantMessage,
          traceId,
          execution: {
            intent: "swot-template",
            mode: "deterministic",
            mcpUsed,
            fallbackUsed,
            toolCalls: executionResult.results.length,
            objectsCreated: executionResult.createdObjectIds.length
          }
        });

        await writeAiAuditLogIfEnabled({
          boardId: parsedPayload.boardId,
          userId: user.uid,
          message: parsedPayload.message,
          traceId,
          fallbackUsed,
          mcpUsed,
          toolCalls: executionResult.results.length,
          objectsCreated: executionResult.createdObjectIds.length,
          intent
        });

        const responseSpan = activeTrace.startSpan("ai.response.sent", {
          status: 200,
          provider: payload.provider
        });
        responseSpan.end({
          traceId: payload.traceId ?? null
        });

        activeTrace.finishSuccess({
          toolCalls: executionResult.results.length,
          objectsCreated: executionResult.createdObjectIds.length,
          fallbackUsed,
          mcpUsed
        });

        return payload;
      })(),
      AI_ROUTE_TIMEOUT_MS,
      "AI command timed out."
    );

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const errorWithStatus = error as { status?: unknown; message?: unknown };
    if (typeof errorWithStatus.status === "number" && typeof errorWithStatus.message === "string") {
      const responseSpan = activeTrace?.startSpan("ai.response.sent", {
        status: errorWithStatus.status
      });
      responseSpan?.fail(errorWithStatus.message);
      activeTrace?.finishError(errorWithStatus.message, {
        status: errorWithStatus.status
      });
      return NextResponse.json(
        { error: errorWithStatus.message },
        { status: errorWithStatus.status }
      );
    }

    if (
      error instanceof Error &&
      error.message === "AI command timed out."
    ) {
      const responseSpan = activeTrace?.startSpan("ai.response.sent", {
        status: 504
      });
      responseSpan?.fail(error.message);
      activeTrace?.finishError(error.message, {
        status: 504
      });
      return NextResponse.json(
        { error: "AI command timed out." },
        { status: 504 }
      );
    }

    activeTrace?.finishError("Failed to handle board AI command.", {
      reason: getDebugMessage(error) ?? "Unknown error"
    });
    const responseSpan = activeTrace?.startSpan("ai.response.sent", {
      status: 500
    });
    responseSpan?.fail("Failed to handle board AI command.");

    console.error("Failed to handle board AI command", error);
    return NextResponse.json(
      {
        error: "Failed to handle board AI command.",
        debug: getDebugMessage(error)
      },
      { status: 500 }
    );
  } finally {
    if (boardLockId) {
      releaseBoardCommandLock(boardLockId);
    }
    await flushLangfuseClient();
  }
}
