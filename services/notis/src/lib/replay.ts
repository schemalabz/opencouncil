import { normalizeUsage } from "@/agent/pricing";
import { AnthropicLike, ModelRequest, ModelResponse, RecordedTurn } from "@/agent/types";

/**
 * Deps.anthropic implementations for tests and the record script.
 *
 * ReplayAnthropic serves pre-recorded turns in order — the golden suite runs
 * the entire runWake loop against real recorded Opus behavior, free and
 * deterministically. RecordingAnthropic wraps a real implementation and
 * captures its turns in the fixture format.
 */

export class ReplayAnthropic implements AnthropicLike {
  private cursor = 0;
  public readonly requests: ModelRequest[] = [];
  private readonly turns: RecordedTurn[];

  constructor(turns: RecordedTurn[]) {
    // Traces record harness-injected nudge turns for the inspector; only
    // model turns are responses to replay.
    this.turns = turns.filter((t) => t.role !== "injected");
  }

  async create(params: ModelRequest): Promise<ModelResponse> {
    this.requests.push(params);
    const turn = this.turns[this.cursor];
    if (!turn) {
      throw new Error(
        `ReplayAnthropic: request #${this.cursor + 1} but only ${this.turns.length} recorded turns`,
      );
    }
    this.cursor++;
    // The inverse of normalizeUsage: a replayed wake must cost what the
    // recorded one cost, so every billed dimension makes the round trip —
    // the TTL split and the per-request searches included.
    return {
      content: turn.content,
      stop_reason: turn.stopReason,
      usage: {
        input_tokens: turn.usage.input,
        output_tokens: turn.usage.output,
        cache_creation_input_tokens: turn.usage.cacheWrite,
        cache_read_input_tokens: turn.usage.cacheRead,
        cache_creation:
          turn.usage.cacheWrite1h === undefined
            ? null
            : { ephemeral_1h_input_tokens: turn.usage.cacheWrite1h },
        server_tool_use: turn.usage.webSearches
          ? { web_search_requests: turn.usage.webSearches }
          : null,
      },
    };
  }
}

export class RecordingAnthropic implements AnthropicLike {
  public readonly recorded: RecordedTurn[] = [];

  constructor(private inner: AnthropicLike) {}

  async create(params: ModelRequest): Promise<ModelResponse> {
    const response = await this.inner.create(params);
    this.recorded.push({
      content: response.content,
      stopReason: response.stop_reason ?? "unknown",
      // The same projection the wake bills on, so a fixture carries every
      // dimension of what the recorded turn cost.
      usage: normalizeUsage(response.usage),
    });
    return response;
  }
}
