import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  buildStubBoardCommandResponse,
  detectBoardCommandIntent,
  parseBoardCommandRequest,
} from "@/features/ai/board-command";
import {
  AI_ROUTE_TIMEOUT_MS,
  acquireBoardCommandLock,
  checkUserRateLimit,
  releaseBoardCommandLock,
  withTimeout,
} from "@/features/ai/guardrails";
import { createAiTraceRun } from "@/features/ai/observability/trace-run";
import { runEditableBoardCommandFlow } from "@/features/ai/server/board-command-editable-flow";
import { flushAiTracesWithTimeout } from "@/features/ai/server/board-command-trace-flush";
import {
  createHttpError,
  getAiTraceFlushTimeoutMs,
  getAiTracingConfigurationError,
  getDebugMessage,
  getErrorReason,
} from "@/features/ai/server/board-command-runtime-config";
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
          const {
            payloadWithTrace,
            plannerResult,
            fallbackUsed,
            llmUsed,
            mcpUsed,
          } = await runEditableBoardCommandFlow({
            boardId: parsedPayload.boardId,
            message: parsedPayload.message,
            userId: user.uid,
            requestOrigin: request.nextUrl.origin,
            selectedObjectIds: parsedPayload.selectedObjectIds,
            viewportBounds: parsedPayload.viewportBounds ?? null,
            traceId,
            trace: activeTrace,
          });
          const responsePayload = payloadWithTrace as {
            provider: string;
            traceId?: string;
            execution?: {
              toolCalls?: number;
              objectsCreated?: number;
            };
          };
          const responseSpan = activeTrace.startSpan("ai.response.sent", {
            status: 200,
            provider: responsePayload.provider,
          });
          responseSpan.end({
            traceId: responsePayload.traceId ?? null,
          });
          activeTrace.finishSuccess({
            intent: plannerResult.intent,
            planned: plannerResult.planned,
            toolCalls: responsePayload.execution?.toolCalls ?? 0,
            objectsCreated: responsePayload.execution?.objectsCreated ?? 0,
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
    await flushAiTracesWithTimeout(getAiTraceFlushTimeoutMs());
  }
}
