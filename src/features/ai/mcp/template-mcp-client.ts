import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { DeterministicCommandPlanResult } from "@/features/ai/commands/deterministic-command-planner";
import { withTimeout } from "@/features/ai/guardrails";
import type {
  BoardObjectSnapshot,
  TemplateInstantiateInput,
  TemplateInstantiateOutput
} from "@/features/ai/types";

type TemplateMcpClientOptions = {
  endpointUrl: URL;
  internalToken: string;
  timeoutMs: number;
};

type CallTemplateOptions = TemplateMcpClientOptions & {
  input: TemplateInstantiateInput;
};

type CallCommandPlanOptions = TemplateMcpClientOptions & {
  message: string;
  selectedObjectIds: string[];
  boardState: BoardObjectSnapshot[];
};

function parseTemplateInstantiateOutput(value: unknown): TemplateInstantiateOutput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    plan?: {
      templateId?: unknown;
      templateName?: unknown;
      operations?: unknown;
    };
  };

  if (!candidate.plan || typeof candidate.plan !== "object") {
    return null;
  }

  const templateId = candidate.plan.templateId;
  const templateName = candidate.plan.templateName;
  const operations = candidate.plan.operations;

  if (typeof templateId !== "string" || templateId.length === 0) {
    return null;
  }

  if (typeof templateName !== "string" || templateName.length === 0) {
    return null;
  }

  if (!Array.isArray(operations)) {
    return null;
  }

  return value as TemplateInstantiateOutput;
}

function parseCommandPlanOutput(value: unknown): DeterministicCommandPlanResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    planned?: unknown;
    intent?: unknown;
    assistantMessage?: unknown;
    plan?: unknown;
  };

  if (
    typeof candidate.planned !== "boolean" ||
    typeof candidate.intent !== "string" ||
    typeof candidate.assistantMessage !== "string"
  ) {
    return null;
  }

  if (!candidate.planned) {
    return {
      planned: false,
      intent: candidate.intent,
      assistantMessage: candidate.assistantMessage
    };
  }

  if (!candidate.plan || typeof candidate.plan !== "object") {
    return null;
  }

  return value as DeterministicCommandPlanResult;
}

async function withMcpClient<T>(
  options: TemplateMcpClientOptions,
  callback: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client({
    name: "collabboard-ai-route",
    version: "1.0.0"
  });
  const transport = new StreamableHTTPClientTransport(options.endpointUrl, {
    requestInit: {
      headers: {
        "x-mcp-internal-token": options.internalToken
      }
    }
  });

  try {
    await withTimeout(
      client.connect(transport),
      options.timeoutMs,
      "MCP client connection timed out."
    );

    return await callback(client);
  } finally {
    await Promise.allSettled([client.close(), transport.close()]);
  }
}

export async function callTemplateInstantiateTool(
  options: CallTemplateOptions
): Promise<TemplateInstantiateOutput> {
  return withMcpClient(options, async (client) => {
    const result = await withTimeout(
      client.callTool({
        name: "template.instantiate",
        arguments: options.input
      }),
      options.timeoutMs,
      "MCP template call timed out."
    );

    const structured = (result as { structuredContent?: unknown }).structuredContent;
    const parsed = parseTemplateInstantiateOutput(structured);
    if (!parsed) {
      throw new Error("Template MCP returned invalid structured output.");
    }

    return parsed;
  });
}

export async function callCommandPlanTool(
  options: CallCommandPlanOptions
): Promise<DeterministicCommandPlanResult> {
  return withMcpClient(options, async (client) => {
    const result = await withTimeout(
      client.callTool({
        name: "command.plan",
        arguments: {
          message: options.message,
          selectedObjectIds: options.selectedObjectIds,
          boardState: options.boardState
        }
      }),
      options.timeoutMs,
      "MCP command planner timed out."
    );

    const structured = (result as { structuredContent?: unknown }).structuredContent;
    const parsed = parseCommandPlanOutput(structured);
    if (!parsed) {
      throw new Error("MCP command planner returned invalid structured output.");
    }

    return parsed;
  });
}
