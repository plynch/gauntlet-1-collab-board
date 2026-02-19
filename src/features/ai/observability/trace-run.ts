import type { LangfuseSpanClient, LangfuseTraceClient } from "langfuse";

import { getLangfuseClient } from "@/features/ai/observability/langfuse-client";

type JsonRecord = Record<string, unknown>;

type CreateTraceRunOptions = {
  traceName: string;
  traceId: string;
  userId: string;
  boardId: string;
  message: string;
  metadata?: JsonRecord;
};

type SpanHandle = {
  end: (output?: JsonRecord) => void;
  fail: (errorMessage: string, details?: JsonRecord) => void;
};

export type AiTraceRun = {
  traceId: string;
  startSpan: (name: string, input?: JsonRecord) => SpanHandle;
  updateMetadata: (metadata: JsonRecord) => void;
  finishSuccess: (output?: JsonRecord) => void;
  finishError: (errorMessage: string, details?: JsonRecord) => void;
};

/**
 * Handles now iso.
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Handles update span.
 */
function updateSpan(
  span: LangfuseSpanClient,
  payload: {
    output?: JsonRecord;
    metadata?: JsonRecord;
    statusMessage?: string;
    level?: "ERROR" | "WARNING" | "DEFAULT" | "DEBUG";
  },
): void {
  span.update({
    ...(payload.output ? { output: payload.output } : {}),
    ...(payload.metadata ? { metadata: payload.metadata } : {}),
    ...(payload.statusMessage ? { statusMessage: payload.statusMessage } : {}),
    ...(payload.level ? { level: payload.level } : {}),
  });
}

/**
 * Creates noop span handle.
 */
function createNoopSpanHandle(): SpanHandle {
  return {
    end: () => {
      // no-op
    },
    fail: () => {
      // no-op
    },
  };
}

/**
 * Creates ai trace run.
 */
export function createAiTraceRun(options: CreateTraceRunOptions): AiTraceRun {
  const langfuse = getLangfuseClient();
  const trace: LangfuseTraceClient | null = langfuse
    ? langfuse.trace({
        id: options.traceId,
        name: options.traceName,
        userId: options.userId,
        sessionId: options.boardId,
        input: {
          message: options.message,
        },
        metadata: {
          boardId: options.boardId,
          startedAt: nowIso(),
          ...(options.metadata ?? {}),
        },
      })
    : null;

  return {
    traceId: options.traceId,
    startSpan: (name, input) => {
      if (!trace) {
        return createNoopSpanHandle();
      }

      const span = trace.span({
        name,
        input: input ?? {},
        metadata: {
          boardId: options.boardId,
        },
      });

      return {
        end: (output) => {
          updateSpan(span, {
            output: output ?? {},
            metadata: {
              completedAt: nowIso(),
            },
          });
          span.end();
        },
        fail: (errorMessage, details) => {
          updateSpan(span, {
            level: "ERROR",
            statusMessage: errorMessage,
            output: details ?? { error: errorMessage },
            metadata: {
              failedAt: nowIso(),
            },
          });
          span.end();
        },
      };
    },
    updateMetadata: (metadata) => {
      if (!trace) {
        return;
      }

      trace.update({
        metadata,
      });
    },
    finishSuccess: (output) => {
      if (!trace) {
        return;
      }

      trace.update({
        output: output ?? {},
        metadata: {
          boardId: options.boardId,
          completedAt: nowIso(),
        },
      });
    },
    finishError: (errorMessage, details) => {
      if (!trace) {
        return;
      }

      trace.update({
        output: details ?? { error: errorMessage },
        metadata: {
          boardId: options.boardId,
          failedAt: nowIso(),
          errorMessage,
        },
      });
    },
  };
}
