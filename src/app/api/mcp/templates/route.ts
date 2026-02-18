import { NextRequest, NextResponse } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import { planDeterministicCommand } from "@/features/ai/commands/deterministic-command-planner";
import {
  instantiateLocalTemplate,
  listLocalTemplates
} from "@/features/ai/templates/local-template-provider";
import type { BoardObjectSnapshot, TemplateInstantiateInput } from "@/features/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getInternalToken(): string | null {
  const token = process.env.MCP_INTERNAL_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

function isAuthorized(request: NextRequest): boolean {
  const expected = getInternalToken();
  if (!expected) {
    return false;
  }

  const received = request.headers.get("x-mcp-internal-token")?.trim();
  return Boolean(received && received === expected);
}

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
  selectedObjectIds?: string[];
  existingObjectCount?: number;
}): TemplateInstantiateInput {
  return {
    templateId: args.templateId,
    boardBounds: args.boardBounds ?? null,
    selectedObjectIds: args.selectedObjectIds ?? [],
    existingObjectCount: args.existingObjectCount ?? 0
  };
}

function toBoardState(raw: unknown): BoardObjectSnapshot[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((value): value is BoardObjectSnapshot => {
      if (!value || typeof value !== "object") {
        return false;
      }

      const candidate = value as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.type === "string" &&
        typeof candidate.x === "number" &&
        typeof candidate.y === "number" &&
        typeof candidate.width === "number" &&
        typeof candidate.height === "number" &&
        typeof candidate.rotationDeg === "number" &&
        typeof candidate.color === "string" &&
        typeof candidate.text === "string" &&
        typeof candidate.zIndex === "number"
      );
    })
    .map((value) => ({
      ...value,
      updatedAt: value.updatedAt ?? null
    }));
}

function createTemplateMcpServer(): McpServer {
  const server = new McpServer({
    name: "collabboard-template-mcp",
    version: "1.0.0"
  });

  server.registerTool(
    "template.list",
    {
      description: "List available whiteboard templates.",
      inputSchema: {}
    },
    async () => {
      const templates = listLocalTemplates();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ templates })
          }
        ],
        structuredContent: {
          templates
        }
      };
    }
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
            height: z.number()
          })
          .nullable()
          .optional(),
        selectedObjectIds: z.array(z.string()).optional(),
        existingObjectCount: z.number().int().min(0).optional()
      }
    },
    async (args) => {
      const input = toTemplateInstantiateInput(args);
      const output = instantiateLocalTemplate(input);

      return {
        content: [
          {
            type: "text",
            text: `Instantiated template ${input.templateId}.`
          }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "command.plan",
    {
      description: "Plan deterministic board tool operations from a natural language command.",
      inputSchema: {
        message: z.string(),
        selectedObjectIds: z.array(z.string()).optional(),
        boardState: z.array(z.unknown()).optional()
      }
    },
    async (args) => {
      const result = planDeterministicCommand({
        message: args.message,
        selectedObjectIds: args.selectedObjectIds ?? [],
        boardState: toBoardState(args.boardState)
      });

      return {
        content: [
          {
            type: "text",
            text: result.planned
              ? `Planned command intent: ${result.intent}.`
              : `No deterministic plan generated (${result.intent}).`
          }
        ],
        structuredContent: result
      };
    }
  );

  return server;
}

async function handleMcpRequest(request: NextRequest): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  const server = createTemplateMcpServer();

  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await Promise.allSettled([server.close(), transport.close()]);
  }
}

async function handleMethod(request: NextRequest): Promise<Response> {
  if (!getInternalToken()) {
    return NextResponse.json(
      { error: "MCP internal token is not configured." },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return handleMcpRequest(request);
}

export async function POST(request: NextRequest) {
  return handleMethod(request);
}

export async function GET(request: NextRequest) {
  return handleMethod(request);
}

export async function DELETE(request: NextRequest) {
  return handleMethod(request);
}
