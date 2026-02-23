import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  buildClearBoardAssistantMessage,
  buildDeterministicBoardCommandResponse,
  buildOpenAiBoardCommandResponse,
  buildStubBoardCommandResponse,
  detectBoardCommandIntent,
  MCP_TEMPLATE_TIMEOUT_MS,
  parseBoardCommandRequest,
} from "@/features/ai/board-command";
import {
  AI_ROUTE_TIMEOUT_MS,
  acquireBoardCommandLock,
  checkUserRateLimit,
  releaseBoardCommandLock,
  validateTemplatePlan,
  withTimeout,
} from "@/features/ai/guardrails";
import {
  callCommandPlanTool,
} from "@/features/ai/mcp/template-mcp-client";
import {
  flushLangfuseClient,
} from "@/features/ai/observability/langfuse-client";
import { createAiTraceRun } from "@/features/ai/observability/trace-run";
import { planDeterministicCommand } from "@/features/ai/commands/deterministic-command-planner";
import { getOpenAiPlannerConfig } from "@/features/ai/openai/openai-client";
import {
  flushOpenAiTraces,
} from "@/features/ai/openai/agents/openai-agents-runner";
import { getOpenAiRequiredErrorResponse } from "@/features/ai/openai/openai-required-response";
import { attemptOpenAiPlanner } from "@/features/ai/server/board-command-openai-attempt";
import {
  buildOpenAiExecutionSummary,
  isOpenAiRequiredForStubCommands,
} from "@/features/ai/server/board-command-openai-types";
import {
  buildOutcomeAssistantMessageFromExecution,
} from "@/features/ai/server/board-command-plan-trace";
import {
  deleteBoardObjectsById,
  executePlanWithTracing,
  listAllBoardObjectIds,
  writeAiAuditLogIfEnabled,
} from "@/features/ai/server/board-command-plan-executor";
import { shouldExecuteDeterministicPlan } from "@/features/ai/server/board-command-deterministic-policy";
import {
  createHttpError,
  getAiTraceFlushTimeoutMs,
  getAiTracingConfigurationError,
  getDebugMessage,
  getErrorReason,
  getInternalMcpToken,
} from "@/features/ai/server/board-command-runtime-config";
import { BoardToolExecutor } from "@/features/ai/tools/board-tools";
import type {
  BoardToolCall,
  TemplatePlan,
} from "@/features/ai/types";
import {
  assertFirestoreWritesAllowedInDev,
  getFirebaseAdminDb,
} from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/server/auth/require-user";
import {
  canUserEditBoard,
  canUserReadBoard,
  parseBoardDoc,
} from "@/server/boards/board-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let activeTrace: ReturnType<typeof createAiTraceRun> | null = null;
  let boardLockId: string | null = null;

  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const parsedPayload = parseBoardCommandRequest(payload);
    if (!parsedPayload) {
      return NextResponse.json(
        { error: "Invalid board command payload." },
        { status: 400 },
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
      return NextResponse.json(
        { error: "Invalid board data." },
        { status: 500 },
      );
    }

    if (!canUserReadBoard(board, user.uid)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const intent = detectBoardCommandIntent(parsedPayload.message);
    const canEdit = canUserEditBoard(board, user.uid);
    const tracingConfigurationError = getAiTracingConfigurationError();
    if (tracingConfigurationError) {
      return NextResponse.json(
        { error: tracingConfigurationError },
        { status: 503 },
      );
    }

    if (canEdit) {
      assertFirestoreWritesAllowedInDev();
    }

    if (intent === "stub" && !canEdit) {
      const traceId = randomUUID();
      activeTrace = createAiTraceRun({
        traceName: "board-command",
        traceId,
        userId: user.uid,
        boardId: parsedPayload.boardId,
        message: parsedPayload.message,
        metadata: {
          intent,
        },
      });

      const response = buildStubBoardCommandResponse({
        message: parsedPayload.message,
        canEdit,
      });
      const responseWithTrace = {
        ...response,
        traceId,
      };
      const responseSpan = activeTrace.startSpan("ai.response.sent", {
        status: 200,
        provider: response.provider,
      });
      responseSpan.end({
        traceId,
      });
      activeTrace.finishSuccess({
        fallbackUsed: false,
        mcpUsed: false,
        mode: "stub",
      });
      return NextResponse.json(responseWithTrace);
    }

    if (canEdit) {
      const rateLimitResult = await checkUserRateLimit(user.uid);
      if (!rateLimitResult.ok) {
        return NextResponse.json(
          { error: rateLimitResult.error },
          { status: rateLimitResult.status },
        );
      }

      const lockResult = await acquireBoardCommandLock(parsedPayload.boardId);
      if (!lockResult.ok) {
        return NextResponse.json(
          { error: lockResult.error },
          { status: lockResult.status },
        );
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
          intent,
        },
      });

      const response = await withTimeout(
        (async () => {
          const executor = new BoardToolExecutor({
            boardId: parsedPayload.boardId,
            userId: user.uid,
          });

          const stateSpan = activeTrace.startSpan("ai.request.received", {
            selectedObjectCount: parsedPayload.selectedObjectIds?.length ?? 0,
          });
          const boardObjects = await executor.getBoardState();
          stateSpan.end({
            existingObjectCount: boardObjects.length,
          });

          let plannerResult:
            | {
                planned: boolean;
                intent: string;
                assistantMessage: string;
                plan?: TemplatePlan;
                selectionUpdate?: {
                  mode: "clear" | "replace";
                  objectIds: string[];
                };
              }
            | null = null;
          let fallbackUsed = false;
          let mcpUsed = true;
          let llmUsed = false;
          const selectedObjectIds = parsedPayload.selectedObjectIds ?? [];
          const openAiConfig = getOpenAiPlannerConfig();
          const plannerMode = openAiConfig.plannerMode;
          const requireOpenAi =
            plannerMode === "openai-strict" || isOpenAiRequiredForStubCommands();
          const deterministicPlanResult = planDeterministicCommand({
            message: parsedPayload.message,
            boardState: boardObjects,
            selectedObjectIds,
            viewportBounds: parsedPayload.viewportBounds ?? null,
          });
          const forceDeterministicForClearIntent =
            deterministicPlanResult.intent === "clear-board" ||
            deterministicPlanResult.intent === "clear-board-empty";
          const shouldExecuteDeterministic =
            forceDeterministicForClearIntent ||
            (deterministicPlanResult.planned &&
              shouldExecuteDeterministicPlan(
                plannerMode,
                deterministicPlanResult.intent,
              ));
          const shouldAttemptOpenAi =
            plannerMode !== "deterministic-only" && !shouldExecuteDeterministic;

          const openAiAttempt = shouldAttemptOpenAi
            ? await attemptOpenAiPlanner({
                message: parsedPayload.message,
                boardId: parsedPayload.boardId,
                userId: user.uid,
                boardState: boardObjects,
                selectedObjectIds,
                viewportBounds: parsedPayload.viewportBounds ?? null,
                executor,
                trace: activeTrace,
              })
            : {
                status: "disabled" as const,
                model: openAiConfig.model,
                runtime: openAiConfig.runtime,
              reason:
                shouldExecuteDeterministic
                  ? "Skipped because deterministic planner was used."
                : deterministicPlanResult.planned
                  ? "Skipped deterministic planner to prefer OpenAI."
                    : plannerMode === "deterministic-only"
                      ? "Skipped because AI_PLANNER_MODE=deterministic-only."
                    : "OpenAI planner disabled by runtime configuration.",
            };
          const openAiExecution = buildOpenAiExecutionSummary(openAiAttempt);
          if (shouldExecuteDeterministic) {
            plannerResult = deterministicPlanResult;
            mcpUsed = false;
          } else if (openAiAttempt.status === "planned") {
            plannerResult = {
              planned: true,
              intent: openAiAttempt.intent,
              assistantMessage: openAiAttempt.assistantMessage,
              plan: openAiAttempt.plan ?? undefined,
            };
            llmUsed = true;
            mcpUsed = false;
          } else if (openAiAttempt.status === "policy-blocked") {
            plannerResult = {
              planned: false,
              intent: openAiAttempt.intent,
              assistantMessage: openAiAttempt.assistantMessage,
            };
            llmUsed = true;
            mcpUsed = false;
          } else if (
            shouldAttemptOpenAi &&
            (openAiAttempt.status === "not-planned" ||
              openAiAttempt.status === "budget-blocked" ||
              openAiAttempt.status === "error")
          ) {
            fallbackUsed = true;
          }

          if (
            requireOpenAi &&
            !shouldExecuteDeterministic &&
            openAiAttempt.status !== "planned" &&
            openAiAttempt.status !== "policy-blocked"
          ) {
            const failure = getOpenAiRequiredErrorResponse(openAiAttempt);
            throw createHttpError(failure.status, failure.message);
          }

          if (!plannerResult) {
            const mcpSpan = activeTrace.startSpan("mcp.call", {
              endpoint: "/api/mcp/templates",
              tool: "command.plan",
            });
            const token = getInternalMcpToken();
            if (!token) {
              fallbackUsed = true;
              mcpUsed = false;
              mcpSpan.end({
                skipped: true,
                fallbackUsed: true,
                reason: "MCP_INTERNAL_TOKEN is missing.",
              });
              plannerResult = deterministicPlanResult;
            } else {
              try {
                plannerResult = await callCommandPlanTool({
                  endpointUrl: new URL(
                    "/api/mcp/templates",
                    request.nextUrl.origin,
                  ),
                  internalToken: token,
                  timeoutMs: MCP_TEMPLATE_TIMEOUT_MS,
                  message: parsedPayload.message,
                  selectedObjectIds,
                  boardState: boardObjects,
                  viewportBounds: parsedPayload.viewportBounds ?? null,
                });
                mcpSpan.end({
                  fallbackUsed: false,
                });
              } catch (error) {
                fallbackUsed = true;
                mcpUsed = false;
                mcpSpan.fail("MCP command planner failed.", {
                  reason: getErrorReason(error),
                });
                plannerResult = planDeterministicCommand({
                  message: parsedPayload.message,
                  boardState: boardObjects,
                  selectedObjectIds,
                  viewportBounds: parsedPayload.viewportBounds ?? null,
                });
              }
            }
          }

          const intentSpan = activeTrace.startSpan("ai.intent.detected", {
            intent: plannerResult.intent,
          });
          intentSpan.end({
            deterministic: !llmUsed,
            llmUsed,
            planned: plannerResult.planned,
          });

          if (!plannerResult.planned) {
            const execution = {
              intent: plannerResult.intent,
              mode: llmUsed ? ("llm" as const) : ("deterministic" as const),
              mcpUsed,
              fallbackUsed,
              toolCalls: 0,
              objectsCreated: 0,
              openAi: openAiExecution,
            };
            const payload = llmUsed
              ? buildOpenAiBoardCommandResponse({
                  assistantMessage: plannerResult.assistantMessage,
                  traceId,
                  execution,
                })
              : buildDeterministicBoardCommandResponse({
                  assistantMessage: plannerResult.assistantMessage,
                  traceId,
                  execution,
                });
            const payloadWithTrace = {
              ...payload,
              traceId: payload.traceId ?? traceId,
              ...(plannerResult.selectionUpdate
                ? { selectionUpdate: plannerResult.selectionUpdate }
                : {}),
            };

            const responseSpan = activeTrace.startSpan("ai.response.sent", {
              status: 200,
              provider: payloadWithTrace.provider,
            });
            responseSpan.end({
              traceId: payloadWithTrace.traceId ?? null,
            });
            activeTrace.finishSuccess({
              intent: plannerResult.intent,
              planned: false,
              mcpUsed,
              fallbackUsed,
              llmUsed,
            });
            return payloadWithTrace;
          }

          const clearBoardObjectIdsBeforeExecution =
            plannerResult.intent === "clear-board"
              ? boardObjects.map((objectItem) => objectItem.id)
              : null;

          let executionResult: {
            results: Awaited<ReturnType<BoardToolExecutor["executeToolCall"]>>[];
            createdObjectIds: string[];
          };
          let executedOperationCount = 0;
          let executedOperations: BoardToolCall[] = [];

          if (openAiAttempt.status === "planned" && openAiAttempt.executedDirectly) {
            if (!openAiAttempt.directExecution) {
              throw createHttpError(
                500,
                "OpenAI agents runtime did not provide execution results.",
              );
            }
            executionResult = {
              results: openAiAttempt.directExecution.results,
              createdObjectIds: openAiAttempt.directExecution.createdObjectIds,
            };
            executedOperations = openAiAttempt.directExecution.operationsExecuted;
            executedOperationCount =
              openAiAttempt.directExecution.operationsExecuted.length;
          } else {
            const executionPlan = plannerResult.plan;
            if (!executionPlan) {
              throw createHttpError(500, "Planner returned no execution plan.");
            }

            const validation = validateTemplatePlan(executionPlan);
            if (!validation.ok) {
              throw createHttpError(validation.status, validation.error);
            }

            executionResult = await executePlanWithTracing({
              executor,
              trace: activeTrace,
              operations: executionPlan.operations,
            });
            executedOperations = executionPlan.operations;
            executedOperationCount = executionPlan.operations.length;
          }

          const commitSpan = activeTrace.startSpan("board.write.commit", {
            operationCount: executedOperationCount,
          });
          commitSpan.end({
            createdObjectCount: executionResult.createdObjectIds.length,
          });

          let assistantMessage = plannerResult.assistantMessage;
          if (plannerResult.intent === "clear-board") {
            const objectIdsAfterExecution = await listAllBoardObjectIds(
              parsedPayload.boardId,
            );
            if (objectIdsAfterExecution.length > 0) {
              await deleteBoardObjectsById(
                parsedPayload.boardId,
                objectIdsAfterExecution,
              );
            }

            const remainingObjectIds = await listAllBoardObjectIds(
              parsedPayload.boardId,
            );
            const objectCountBeforeExecution =
              clearBoardObjectIdsBeforeExecution?.length ?? boardObjects.length;

            assistantMessage = buildClearBoardAssistantMessage({
              deletedCount: Math.max(
                0,
                objectCountBeforeExecution - remainingObjectIds.length,
              ),
              remainingCount: remainingObjectIds.length,
            });
          } else if (llmUsed) {
            assistantMessage = buildOutcomeAssistantMessageFromExecution({
              fallbackAssistantMessage: plannerResult.assistantMessage,
              operations: executedOperations,
              createdObjectIds: executionResult.createdObjectIds,
              results: executionResult.results,
            });
          }

          const executedToolCalls =
            openAiAttempt.status === "planned" && openAiAttempt.executedDirectly
              ? openAiAttempt.directExecution?.toolCalls ??
                executionResult.results.length
              : executionResult.results.length;

          const execution = {
            intent: plannerResult.intent,
            mode: llmUsed ? ("llm" as const) : ("deterministic" as const),
            mcpUsed,
            fallbackUsed,
            toolCalls: executedToolCalls,
            objectsCreated: executionResult.createdObjectIds.length,
            openAi: openAiExecution,
          };
            const payload = llmUsed
              ? buildOpenAiBoardCommandResponse({
                  assistantMessage,
                  traceId,
                  execution,
                })
              : buildDeterministicBoardCommandResponse({
                  assistantMessage,
                  traceId,
                  execution,
                });
          const payloadWithTrace = {
            ...payload,
            traceId: payload.traceId ?? traceId,
            ...(plannerResult.selectionUpdate
              ? { selectionUpdate: plannerResult.selectionUpdate }
              : {}),
          };

          await writeAiAuditLogIfEnabled({
            boardId: parsedPayload.boardId,
            userId: user.uid,
            message: parsedPayload.message,
            traceId,
            fallbackUsed,
            mcpUsed,
            toolCalls: executedToolCalls,
            objectsCreated: executionResult.createdObjectIds.length,
            intent: plannerResult.intent,
          });

          const responseSpan = activeTrace.startSpan("ai.response.sent", {
            status: 200,
            provider: payloadWithTrace.provider,
          });
          responseSpan.end({
            traceId: payloadWithTrace.traceId ?? null,
          });

          activeTrace.finishSuccess({
            intent: plannerResult.intent,
            toolCalls: executedToolCalls,
            objectsCreated: executionResult.createdObjectIds.length,
            fallbackUsed,
            mcpUsed,
            llmUsed,
          });

          return payloadWithTrace;
        })(),
        AI_ROUTE_TIMEOUT_MS,
        "AI command timed out.",
      );

      return NextResponse.json(response);
    }

    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have edit access for AI mutation commands." },
        { status: 403 },
      );
    }

    throw createHttpError(500, "Unhandled AI command routing state.");
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    const errorWithStatus = error as { status?: unknown; message?: unknown };
    if (
      typeof errorWithStatus.status === "number" &&
      typeof errorWithStatus.message === "string"
    ) {
      const responseSpan = activeTrace?.startSpan("ai.response.sent", {
        status: errorWithStatus.status,
      });
      responseSpan?.fail(errorWithStatus.message);
      activeTrace?.finishError(errorWithStatus.message, {
        status: errorWithStatus.status,
      });
      return NextResponse.json(
        { error: errorWithStatus.message },
        { status: errorWithStatus.status },
      );
    }

    if (error instanceof Error && error.message === "AI command timed out.") {
      const responseSpan = activeTrace?.startSpan("ai.response.sent", {
        status: 504,
      });
      responseSpan?.fail(error.message);
      activeTrace?.finishError(error.message, {
        status: 504,
      });
      return NextResponse.json(
        { error: "AI command timed out." },
        { status: 504 },
      );
    }

    activeTrace?.finishError("Failed to handle board AI command.", {
      reason: getErrorReason(error),
    });
    const responseSpan = activeTrace?.startSpan("ai.response.sent", {
      status: 500,
    });
    responseSpan?.fail("Failed to handle board AI command.");

    console.error("Failed to handle board AI command", error);
    return NextResponse.json(
      {
        error: "Failed to handle board AI command.",
        debug: getDebugMessage(error),
      },
      { status: 500 },
    );
  } finally {
    if (boardLockId) {
      await releaseBoardCommandLock(boardLockId);
    }

    const flushTimeoutMs = getAiTraceFlushTimeoutMs();
    const [langfuseFlushResult, openAiFlushResult] = await Promise.allSettled([
      withTimeout(
        flushLangfuseClient(),
        flushTimeoutMs,
        "Langfuse trace flush timed out.",
      ),
      withTimeout(
        flushOpenAiTraces(),
        flushTimeoutMs,
        "OpenAI trace flush timed out.",
      ),
    ]);

    if (langfuseFlushResult.status === "rejected") {
      console.warn(
        "Failed to flush langfuse traces.",
        langfuseFlushResult.reason,
      );
    }
    if (openAiFlushResult.status === "rejected") {
      console.warn("Failed to flush openai traces.", openAiFlushResult.reason);
    }
  }
}
