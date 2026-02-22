import {
  Agent,
  Runner,
  extractAllTextOutput,
  setDefaultOpenAIClient,
} from "@openai/agents";
import { getGlobalTraceProvider } from "@openai/agents-core";
import { z } from "zod";

import { BOARD_AI_TOOLS } from "@/features/ai/board-tool-schema";
import { parseCoordinateHintsFromMessage } from "@/features/ai/commands/coordinate-hints";
import { MAX_AI_CREATED_OBJECTS_PER_COMMAND } from "@/features/ai/guardrails";
import {
  getOpenAiClient,
  getOpenAiPlannerConfig,
} from "@/features/ai/openai/openai-client";
import type { AiTraceRun } from "@/features/ai/observability/trace-run";
import { createBoardAgentTools } from "@/features/ai/openai/agents/board-agent-tools";
import {
  createEmptyUsage,
  toOpenAiUsage,
  type OpenAiAgentsRunnerUsage,
} from "@/features/ai/openai/agents/openai-agents-usage";
import { parseMessageIntentHints } from "@/features/ai/openai/agents/message-intent-hints";
import { BoardToolExecutor } from "@/features/ai/tools/board-tools";
import type { BoardObjectSnapshot, BoardToolCall, ViewportBounds } from "@/features/ai/types";

const MAX_TEXT_PREVIEW_CHARS = 120;
const MAX_CONTEXT_OBJECTS_FOR_PROMPT = 120;
type ExecuteToolResult = Awaited<ReturnType<BoardToolExecutor["executeToolCall"]>>;

const openAiAgentOutputSchema = z.object({
  intent: z.string().min(1).max(120),
  planned: z.boolean(),
  assistantMessage: z.string().min(1).max(1_000),
});

export type OpenAiAgentsRunnerResult = {
  intent: string;
  planned: boolean;
  assistantMessage: string;
  operationsExecuted: BoardToolCall[];
  results: ExecuteToolResult[];
  createdObjectIds: string[];
  deletedCount: number;
  toolCalls: number;
  usage: OpenAiAgentsRunnerUsage;
  responseId?: string;
  traceId?: string;
  policyBlocked?: {
    requestedCreateCount: number;
    maxAllowedCount: number;
  };
};

type RunBoardCommandWithOpenAiAgentsInput = {
  message: string;
  boardId: string;
  userId: string;
  boardState: BoardObjectSnapshot[];
  selectedObjectIds: string[];
  viewportBounds: ViewportBounds | null;
  executor: BoardToolExecutor;
  trace: AiTraceRun;
};

function toBoardContextObject(objectItem: BoardObjectSnapshot) {
  return {
    id: objectItem.id,
    type: objectItem.type,
    x: objectItem.x,
    y: objectItem.y,
    width: objectItem.width,
    height: objectItem.height,
    color: objectItem.color,
    text: objectItem.text.slice(0, MAX_TEXT_PREVIEW_CHARS),
  };
}

const OPENAI_AGENTS_SYSTEM_PROMPT = [
  "You are the CollabBoard AI command agent.",
  "Your job is to execute board operations through tools and then return a concise final result object.",
  "Use only the provided tools. Never invent tool names.",
  "For simple single-object create commands, call the create tool directly without getBoardState.",
  "Use high-level tools when possible: createStickyBatch, moveObjects, fitFrameToContents, arrangeObjectsInGrid, alignObjects, distributeObjects.",
  "For line creation, use createShape with type='line'.",
  "When user says across screen/viewport/canvas, include viewportBounds in layout tools that support it.",
  "When user says middle/center for grid layout, set centerInViewport=true and include viewportBounds in arrangeObjectsInGrid.",
  "For spacing across screen: alignObjects first (middle for horizontal, center for vertical), then distributeObjects with viewportBounds.",
  "Layout math hint: step=(end-start)/(count-1); use object centers for distribution.",
  "When user asks to create/add sticky notes, you must create new stickies via createStickyNote or createStickyBatch.",
  "Do not satisfy create-sticky requests by mutating existing selected objects.",
  "For multi-clause create requests (e.g. create 5 pink ... create 5 blue ...), execute each clause as its own batch with its own color/count.",
  "Never create more than 50 objects from one command.",
  "If user asks to create more than 50 objects, return planned=false and explain the 50-object limit.",
  "When user provides explicit coordinates, preserve them in tool arguments.",
  "When user asks for selected objects and selectedObjectIds are provided, use those IDs.",
  "Use getBoardState if you need fresh IDs before mutating the board.",
  "If the request cannot be safely mapped, do not mutate and return planned=false.",
  "Return final output as JSON with keys: intent, planned, assistantMessage.",
  "Keep assistantMessage short and user-facing.",
  "Tool names:",
  ...BOARD_AI_TOOLS.map((toolItem) => `- ${toolItem.name}`),
].join("\n");

export async function runBoardCommandWithOpenAiAgents(
  input: RunBoardCommandWithOpenAiAgentsInput,
): Promise<OpenAiAgentsRunnerResult> {
  const config = getOpenAiPlannerConfig();
  const client = getOpenAiClient();
  if (!config.enabled || !client) {
    throw new Error("OpenAI planner is not enabled.");
  }

  const messageIntentHints = parseMessageIntentHints(input.message);
  if (
    typeof messageIntentHints.requestedCreateCount === "number" &&
    messageIntentHints.requestedCreateCount > MAX_AI_CREATED_OBJECTS_PER_COMMAND
  ) {
    return {
      intent: "create-object-limit-exceeded",
      planned: false,
      assistantMessage: `I can create up to ${MAX_AI_CREATED_OBJECTS_PER_COMMAND} objects per command. You asked for ${messageIntentHints.requestedCreateCount}. Try: "create 50 sticky notes", then run another command if needed.`,
      operationsExecuted: [],
      results: [],
      createdObjectIds: [],
      deletedCount: 0,
      toolCalls: 0,
      usage: createEmptyUsage(config.model),
      policyBlocked: {
        requestedCreateCount: messageIntentHints.requestedCreateCount,
        maxAllowedCount: MAX_AI_CREATED_OBJECTS_PER_COMMAND,
      },
    };
  }

  setDefaultOpenAIClient(client);

  const contextObjects = input.boardState
    .slice(0, Math.min(config.maxContextObjects, MAX_CONTEXT_OBJECTS_FOR_PROMPT))
    .map(toBoardContextObject);
  const selectedLookup = new Set(input.selectedObjectIds);
  const selectedObjects = contextObjects.filter((objectItem) =>
    selectedLookup.has(objectItem.id),
  );

  const payload = {
    message: input.message,
    selectedObjectIds: input.selectedObjectIds,
    selectedObjects,
    viewportBounds: input.viewportBounds,
    viewportHint: messageIntentHints.viewportLayoutRequested
      ? "User requested screen/viewport-spanning layout."
      : null,
    boardObjectCount: input.boardState.length,
    boardObjects: contextObjects,
  };
  const coordinateHints = parseCoordinateHintsFromMessage(input.message);

  const boardAgentTools = createBoardAgentTools({
    executor: input.executor,
    trace: input.trace,
    selectedObjectIds: input.selectedObjectIds,
    viewportBounds: input.viewportBounds,
    coordinateHints,
    messageIntentHints,
  });

  const agent = new Agent({
    name: "collabboard-command-agent",
    model: config.model,
    instructions: OPENAI_AGENTS_SYSTEM_PROMPT,
    outputType: openAiAgentOutputSchema,
    tools: boardAgentTools.tools,
    modelSettings: {
      temperature: 0,
      maxTokens: config.maxOutputTokens,
      parallelToolCalls: false,
    },
  });

  const runner = new Runner({
    tracingDisabled: !config.agentsTracing,
    traceIncludeSensitiveData: true,
    workflowName: config.agentsWorkflowName,
    groupId: input.boardId,
    traceMetadata: {
      langfuseTraceId: input.trace.traceId,
      boardId: input.boardId,
      userId: input.userId,
      plannerMode: config.plannerMode,
      runtimeBackend: config.runtime,
    },
  });

  const runResult = await runner.run(agent, JSON.stringify(payload), {
    maxTurns: config.agentsMaxTurns,
    ...(config.agentsTracingApiKey
      ? {
          tracing: {
            apiKey: config.agentsTracingApiKey,
          },
        }
      : {}),
  });
  const usage = toOpenAiUsage({
    model: config.model,
    inputTokens: runResult.state.usage.inputTokens,
    outputTokens: runResult.state.usage.outputTokens,
    inputCostPerMillionUsd: config.inputCostPerMillionUsd,
    outputCostPerMillionUsd: config.outputCostPerMillionUsd,
  });

  const executionSnapshot = boardAgentTools.getExecutionSnapshot();
  const finalOutput = runResult.finalOutput;
  const finalOutputText = extractAllTextOutput(runResult.newItems).trim();
  const openAiTraceIdCandidate = (
    runResult.state as { _trace?: { traceId?: unknown } }
  )._trace?.traceId;
  const openAiTraceId =
    typeof openAiTraceIdCandidate === "string" &&
    openAiTraceIdCandidate.length > 0
      ? openAiTraceIdCandidate
      : undefined;

  const plannedFromOutput = finalOutput?.planned ?? false;
  const hasMutatingOperations = executionSnapshot.operationsExecuted.length > 0;
  const planned = hasMutatingOperations;

  if (plannedFromOutput && !hasMutatingOperations) {
    return {
      intent: finalOutput?.intent?.trim() || "unsupported-command",
      planned: false,
      assistantMessage:
        finalOutput?.assistantMessage?.trim() ||
        finalOutputText ||
        "I could not map that command yet.",
      operationsExecuted: executionSnapshot.operationsExecuted,
      results: executionSnapshot.results,
      createdObjectIds: executionSnapshot.createdObjectIds,
      deletedCount: executionSnapshot.deletedCount,
      toolCalls: executionSnapshot.toolCalls,
      usage,
      responseId: runResult.lastResponseId,
      traceId: openAiTraceId,
    };
  }

  const assistantMessage =
    finalOutput?.assistantMessage?.trim() ||
    (planned
      ? "Completed your board command."
      : finalOutputText || "I could not map that command yet.");
  const intent =
    finalOutput?.intent?.trim() ||
    (planned ? "openai-agents-command" : "unsupported-command");

  return {
    intent,
    planned,
    assistantMessage,
    operationsExecuted: executionSnapshot.operationsExecuted,
    results: executionSnapshot.results,
    createdObjectIds: executionSnapshot.createdObjectIds,
    deletedCount: executionSnapshot.deletedCount,
    toolCalls: executionSnapshot.toolCalls,
    usage,
    responseId: runResult.lastResponseId,
    traceId: openAiTraceId,
  };
}

export async function flushOpenAiTraces(): Promise<void> {
  await getGlobalTraceProvider().forceFlush();
}
