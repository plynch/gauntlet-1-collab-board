import { NextRequest, NextResponse } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import { planDeterministicCommand } from "@/features/ai/commands/deterministic-command-planner";
import {
  instantiateLocalTemplate,
  listLocalTemplates,
} from "@/features/ai/templates/local-template-provider";
import type {
  BoardObjectSnapshot,
  TemplateInstantiateInput,
} from "@/features/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const boardStateObjectSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
  rotationDeg: z.number().finite(),
  color: z.string(),
  text: z.string(),
  zIndex: z.number().finite(),
  updatedAt: z.string().nullable().optional(),
});

const boardStateSchema = z.array(boardStateObjectSchema);

const templateInstantiateArgsSchema = z.object({
  templateId: z.string().min(1),
  boardBounds: z
    .object({
      left: z.number(),
      right: z.number(),
      top: z.number(),
      bottom: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .nullable()
    .optional(),
  viewportBounds: z
    .object({
      left: z.number(),
      top: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  selectedObjectIds: z.array(z.string()).optional(),
  existingObjectCount: z.number().int().min(0).optional(),
});

const commandPlanArgsSchema = z.object({
  message: z.string().min(1),
  selectedObjectIds: z.array(z.string()).optional(),
  boardState: boardStateSchema.optional(),
});

/**
 * Gets internal token.
 */
function getInternalToken(): string | null {
  const token = process.env.MCP_INTERNAL_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

/**
 * Returns whether authorized is true.
 */
function isAuthorized(request: NextRequest): boolean {
  const expected = getInternalToken();
  if (!expected) {
    return false;
  }

  const received = request.headers.get("x-mcp-internal-token")?.trim();
  return Boolean(received && received === expected);
}

/**
 * Handles to template instantiate input.
 */
function toTemplateInstantiateInput(args: {
  templateId: string;
  boardBounds?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  } | null;
  viewportBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  selectedObjectIds?: string[];
  existingObjectCount?: number;
}): TemplateInstantiateInput {
  return {
    templateId: args.templateId,
    boardBounds: args.boardBounds ?? null,
    viewportBounds: args.viewportBounds ?? null,
    selectedObjectIds: args.selectedObjectIds ?? [],
    existingObjectCount: args.existingObjectCount ?? 0,
  };
}

/**
 * Handles to board state.
 */
function toBoardState(raw: unknown): BoardObjectSnapshot[] {
  const parsed = boardStateSchema.safeParse(raw);
  if (!parsed.success) {
    return [];
  }

  return parsed.data.map((value) => ({
    ...value,
    type: value.type as BoardObjectSnapshot["type"],
    updatedAt: value.updatedAt ?? null,
  }));
}

/**
 * Creates template mcp server.
 */
function createTemplateMcpServer(): McpServer {
  const server = new McpServer({
    name: "collabboard-template-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "template.list",
    {
      description: "List available whiteboard templates.",
      inputSchema: {},
    },
    async () => {
      const templates = listLocalTemplates();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ templates }),
          },
        ],
        structuredContent: {
          templates,
        },
      };
    },
  );

  server.registerTool(
    "template.instantiate",
    {
      description: "Build a template plan for a board.",
      inputSchema: {
        templateId: z.string(),
        boardBounds: z
          .object({
            left: z.number(),
            right: z.number(),
            top: z.number(),
            bottom: z.number(),
            width: z.number(),
            height: z.number(),
          })
          .nullable()
          .optional(),
        viewportBounds: z
          .object({
            left: z.number(),
            top: z.number(),
            width: z.number().positive(),
            height: z.number().positive(),
          })
          .optional(),
        selectedObjectIds: z.array(z.string()).optional(),
        existingObjectCount: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      const parsedArgs = templateInstantiateArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        throw new Error("Invalid template.instantiate arguments.");
      }

      const input = toTemplateInstantiateInput(parsedArgs.data);
      const output = instantiateLocalTemplate(input);

      return {
        content: [
          {
            type: "text",
            text: `Instantiated template ${input.templateId}.`,
          },
        ],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "command.plan",
    {
      description:
        "Plan deterministic board tool operations from a natural language command.",
      inputSchema: {
        message: z.string(),
        selectedObjectIds: z.array(z.string()).optional(),
        boardState: z.array(z.unknown()).optional(),
      },
    },
    async (args) => {
      const parsedArgs = commandPlanArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        throw new Error("Invalid command.plan arguments.");
      }

      const result = planDeterministicCommand({
        message: parsedArgs.data.message,
        selectedObjectIds: parsedArgs.data.selectedObjectIds ?? [],
        boardState: toBoardState(parsedArgs.data.boardState),
      });

      return {
        content: [
          {
            type: "text",
            text: result.planned
              ? `Planned command intent: ${result.intent}.`
              : `No deterministic plan generated (${result.intent}).`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  return server;
}

/**
 * Handles handle mcp request.
 */
async function handleMcpRequest(request: NextRequest): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = createTemplateMcpServer();

  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await Promise.allSettled([server.close(), transport.close()]);
  }
}

/**
 * Handles handle method.
 */
async function handleMethod(request: NextRequest): Promise<Response> {
  if (!getInternalToken()) {
    return NextResponse.json(
      { error: "MCP internal token is not configured." },
      { status: 503 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return handleMcpRequest(request);
}

/**
 * Handles post.
 */
export async function POST(request: NextRequest) {
  return handleMethod(request);
}

/**
 * Handles get.
 */
export async function GET(request: NextRequest) {
  return handleMethod(request);
}

/**
 * Handles delete.
 */
export async function DELETE(request: NextRequest) {
  return handleMethod(request);
}
