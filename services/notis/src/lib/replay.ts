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

  constructor(private turns: RecordedTurn[]) {}

  async create(params: ModelRequest): Promise<ModelResponse> {
    this.requests.push(params);
    const turn = this.turns[this.cursor];
    if (!turn) {
      throw new Error(
        `ReplayAnthropic: request #${this.cursor + 1} but only ${this.turns.length} recorded turns`,
      );
    }
    this.cursor++;
    return {
      content: turn.content,
      stop_reason: turn.stopReason,
      usage: {
        input_tokens: turn.usage.input,
        output_tokens: turn.usage.output,
        cache_creation_input_tokens: turn.usage.cacheWrite,
        cache_read_input_tokens: turn.usage.cacheRead,
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
      usage: {
        input: response.usage.input_tokens ?? 0,
        output: response.usage.output_tokens ?? 0,
        cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
      },
    });
    return response;
  }
}
