import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Backend } from "./backend.js";

function json(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function failure(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
}

export const CAPTURE_MODES = ["progressive", "local", "sync"] as const;

/** Registers the Aldus Palace tool surface on an MCP server. */
export function registerTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    "capture",
    {
      title: "Capture a thought or commitment",
      description:
        "Send free-form text to Aldus Palace. The runtime decides whether it is " +
        "a thought, a commitment, or both, and returns the ActionCard it stored. " +
        "Use mode=local for an instant deterministic result, mode=sync to wait " +
        "for the configured model, or leave the default for local-first capture.",
      inputSchema: {
        content: z
          .string()
          .min(1)
          .describe("What the user wants captured, in their own words."),
        mode: z
          .enum(CAPTURE_MODES)
          .optional()
          .describe("progressive (default) | local | sync"),
      },
    },
    async ({ content, mode }) => {
      try {
        return json(await backend.capture(content, mode ?? "progressive"));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "list_today",
    {
      title: "What is planned today",
      description:
        "Today's plan: the now/next timeline, risk items, and unscheduled work. " +
        "This is a projection over commitments, not a separate task list.",
      inputSchema: {},
    },
    async () => {
      try {
        return json(await backend.listToday());
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "list_commitments",
    {
      title: "List commitments",
      description:
        "The full commitment list (the 'to do' view). Optionally filter by " +
        "status: captured, planned, scheduled, completed, cancelled, risk.",
      inputSchema: {
        status: z
          .enum([
            "captured",
            "planned",
            "scheduled",
            "completed",
            "cancelled",
            "risk",
          ])
          .optional(),
      },
    },
    async ({ status }) => {
      try {
        return json(await backend.listCommitments(status));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "list_memories",
    {
      title: "List memories",
      description:
        "Long-term memory. Candidates are what the system proposes from recent " +
        "captures and are NOT active until the user confirms them.",
      inputSchema: {
        status: z.enum(["candidate", "active"]).optional(),
      },
    },
    async ({ status }) => {
      try {
        return json(await backend.listMemories(status ?? "candidate"));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "confirm_memory",
    {
      title: "Confirm a memory candidate",
      description:
        "Promote a candidate memory to active. Only call this after the user has " +
        "explicitly agreed — memory must never be activated silently.",
      inputSchema: {
        memory_id: z.string().min(1).describe("The candidate memory id."),
        concept_names: z
          .array(z.string())
          .optional()
          .describe("Optional concept labels to link; sensible defaults are derived."),
      },
    },
    async ({ memory_id, concept_names }) => {
      try {
        return json(await backend.confirmMemory(memory_id, concept_names));
      } catch (error) {
        return failure(error);
      }
    }
  );
}
