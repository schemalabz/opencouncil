import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG, Deps, Prompts } from "@/agent/types";
import { realAnthropic } from "./anthropic";
import { McpClient } from "./mcp-client";

/**
 * Builds the real Deps for API routes. Prompt files load once at module scope;
 * playground overrides splice in per request without touching disk.
 */

const PROMPTS_DIR = path.join(process.cwd(), "prompts");

function loadContextPack(): string {
  const dir = path.join(PROMPTS_DIR, "context-pack");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8").trim())
    .join("\n\n---\n\n");
}

export const shippedPrompts: Prompts = {
  system: fs.readFileSync(path.join(PROMPTS_DIR, "system.md"), "utf8"),
  contextPack: loadContextPack(),
  editorial: fs.readFileSync(path.join(PROMPTS_DIR, "editorial.md"), "utf8"),
};

const sharedMcp = new McpClient(DEFAULT_CONFIG.mcpUrl);

export interface DepsOverrides {
  promptOverride?: string;
  contextPackOverride?: string;
  model?: string;
  maxTurns?: number;
}

export function buildDeps(overrides: DepsOverrides = {}): Deps {
  return {
    anthropic: realAnthropic,
    now: () => new Date(),
    prompts: {
      system: overrides.promptOverride ?? shippedPrompts.system,
      contextPack: overrides.contextPackOverride ?? shippedPrompts.contextPack,
      editorial: shippedPrompts.editorial,
    },
    config: {
      model: overrides.model ?? DEFAULT_CONFIG.model,
      maxTurns: Math.max(1, Math.min(12, overrides.maxTurns ?? DEFAULT_CONFIG.maxTurns)),
      mcpUrl: DEFAULT_CONFIG.mcpUrl,
    },
    mcp: sharedMcp,
  };
}
