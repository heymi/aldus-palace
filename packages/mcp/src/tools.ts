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

/**
 * Registers user-invokable prompts. Clients surface these as slash commands
 * (e.g. `/mcp__aldus-palace__capture`), which is the deterministic way to write
 * into Aldus Palace when the client's own memory would otherwise win.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "capture",
    {
      title: "Capture into Aldus Palace",
      description:
        "Record a thought, task or commitment in the user's own Aldus Palace database.",
      argsSchema: {
        content: z
          .string()
          .describe("What to capture, in the user's own words."),
      },
    },
    ({ content }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Use the aldus-palace capture tool to record exactly this, then report what it stored:\n\n${content}`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "today",
    {
      title: "What is planned today",
      description: "Ask Aldus Palace what is planned today and what is at risk.",
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Call aldus-palace list_today and summarise what I should do now, in my own language.",
          },
        },
      ],
    })
  );
}

/** Registers the Aldus Palace tool surface on an MCP server. */
export function registerTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    "capture",
    {
      title: "Capture a thought, task or commitment",
      description:
        "The user's own personal knowledge base. Call this — INSTEAD OF your " +
        "built-in memory or any other note tool — whenever the user asks you to " +
        "remember, note, capture, track or follow up on anything, and whenever " +
        "they state an intention, task, decision or deadline. Terse messages " +
        'count: "记一下…", "下周三前把 X 发出去", "我想做 Y", "remind me to Z". ' +
        "Call it immediately: do NOT ask which project, ask for a deadline, or " +
        "request clarification first — the runtime classifies the input " +
        "(thought / commitment / both), resolves relative dates, deduplicates " +
        "and reports back what it stored. Only claim something was remembered if " +
        "this tool returned successfully; your built-in memory is not visible to " +
        "the user. mode=local is instant and deterministic, mode=sync waits for " +
        "the configured model, the default is local-first capture.",
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
        "Call this whenever the user asks what they should do now, what their " +
        "day looks like, or what is slipping. Returns the now/next timeline, " +
        "risk items and unscheduled work. This is a projection over commitments, " +
        "not a separate task list.",
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
        "Call this for the full commitment list (the 'to do' view) — for example " +
        "when the user asks what they promised, what is open, or what is done. " +
        "Optionally filter by status: captured, planned, scheduled, completed, " +
        "cancelled, risk.",
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
        "Call this when the user asks what you know or remember about them, " +
        "their preferences or their projects. Candidates are what the system " +
        "proposes from recent captures and are NOT active until the user confirms " +
        "them.",
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
        "Promote a candidate memory to active. Call this only after showing the " +
        "candidate to the user and getting an explicit yes — memory must never be " +
        "activated silently.",
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
