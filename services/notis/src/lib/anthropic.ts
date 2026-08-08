import Anthropic from "@anthropic-ai/sdk";
import { AnthropicLike, ModelRequest, ModelResponse } from "@/agent/types";
import { env } from "@/env.mjs";

const MCP_BETA = "mcp-client-2025-11-20";
/** 1h prompt-cache TTL — playground steps sit minutes apart, 5m dies between them. */
const CACHE_TTL_BETA = "extended-cache-ttl-2025-04-11";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

/** Real Deps.anthropic implementation over the beta namespace (MCP connector). */
export const realAnthropic: AnthropicLike = {
  async create(params: ModelRequest): Promise<ModelResponse> {
    // Streamed under the hood: the SDK rejects non-streaming requests whose
    // max_tokens could exceed its 10-minute heuristic (bites at 32k).
    const response = await getClient()
      .beta.messages.stream({
        betas: [MCP_BETA, CACHE_TTL_BETA],
        model: params.model,
        max_tokens: params.max_tokens,
        system: params.system,
        // The core builds request content structurally; the SDK validates at runtime.
        messages: params.messages as never,
        ...(params.tools ? { tools: params.tools as never } : {}),
        ...(params.mcp_servers ? { mcp_servers: params.mcp_servers as never } : {}),
        ...(params.output_config ? { output_config: params.output_config as never } : {}),
      })
      .finalMessage();
    return {
      content: response.content as unknown[],
      stop_reason: response.stop_reason,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
        cache_read_input_tokens: response.usage.cache_read_input_tokens,
      },
    };
  },
};
