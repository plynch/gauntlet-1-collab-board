import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import type { DeterministicCommandPlanResult } from "@/features/ai/commands/deterministic-command-planner";
import { withTimeout } from "@/features/ai/guardrails";
import type {
  BoardObjectSnapshot,
  TemplateInstantiateInput,
  TemplateInstantiateOutput,
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
  viewportBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
};

const operationSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
});

const templateInstantiateOutputSchema = z.object({
  plan: z.object({
    templateId: z.string().min(1),
    templateName: z.string().min(1),
    operations: z.array(operationSchema),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});

const commandPlanOutputSchema = z.discriminatedUnion("planned", [
  z.object({
    planned: z.literal(false),
    intent: z.string().min(1),
    assistantMessage: z.string().min(1),
  }),
  z.object({
    planned: z.literal(true),
    intent: z.string().min(1),
    assistantMessage: z.string().min(1),
    plan: z.object({
      templateId: z.string().min(1),
      templateName: z.string().min(1),
      operations: z.array(operationSchema),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
]);

function parseTemplateInstantiateOutput(
  value: unknown,
): TemplateInstantiateOutput | null {
  const parsed = templateInstantiateOutputSchema.safeParse(value);
  return parsed.success ? (parsed.data as TemplateInstantiateOutput) : null;
}

function parseCommandPlanOutput(
  value: unknown,
): DeterministicCommandPlanResult | null {
  const parsed = commandPlanOutputSchema.safeParse(value);
  return parsed.success
    ? (parsed.data as DeterministicCommandPlanResult)
    : null;
}

async function withMcpClient<T>(
  options: TemplateMcpClientOptions,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    name: "collabboard-ai-route",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(options.endpointUrl, {
    requestInit: {
      headers: {
        "x-mcp-internal-token": options.internalToken,
      },
    },
  });

  try {
    await withTimeout(
      client.connect(transport),
      options.timeoutMs,
      "MCP client connection timed out.",
    );

    return await callback(client);
  } finally {
    await Promise.allSettled([client.close(), transport.close()]);
  }
}

export async function callTemplateInstantiateTool(
  options: CallTemplateOptions,
): Promise<TemplateInstantiateOutput> {
  return withMcpClient(options, async (client) => {
    const result = await withTimeout(
      client.callTool({
        name: "template.instantiate",
        arguments: options.input,
      }),
      options.timeoutMs,
      "MCP template call timed out.",
    );

    const structured = (result as { structuredContent?: unknown })
      .structuredContent;
    const parsed = parseTemplateInstantiateOutput(structured);
    if (!parsed) {
      throw new Error("Template MCP returned invalid structured output.");
    }

    return parsed;
  });
}

export async function callCommandPlanTool(
  options: CallCommandPlanOptions,
): Promise<DeterministicCommandPlanResult> {
  return withMcpClient(options, async (client) => {
    const result = await withTimeout(
      client.callTool({
        name: "command.plan",
        arguments: {
          message: options.message,
          selectedObjectIds: options.selectedObjectIds,
          boardState: options.boardState,
          viewportBounds: options.viewportBounds ?? undefined,
        },
      }),
      options.timeoutMs,
      "MCP command planner timed out.",
    );

    const structured = (result as { structuredContent?: unknown })
      .structuredContent;
    const parsed = parseCommandPlanOutput(structured);
    if (!parsed) {
      throw new Error(
        "MCP command planner returned invalid structured output.",
      );
    }

    return parsed;
  });
}
