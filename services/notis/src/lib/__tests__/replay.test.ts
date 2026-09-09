import { normalizeUsage } from "@/agent/pricing";
import { AnthropicLike, ModelRequest, ModelResponse, Usage } from "@/agent/types";
import { RecordingAnthropic, ReplayAnthropic } from "../replay";

const request: ModelRequest = {
  model: "claude-sonnet-5",
  max_tokens: 100,
  system: [{ type: "text", text: "S" }],
  messages: [],
};

function stubModel(usage: ModelResponse["usage"]): AnthropicLike {
  return { create: async () => ({ content: [], stop_reason: "end_turn", usage }) };
}

describe("record/replay usage round trip", () => {
  it("carries every billed dimension from a recording into its replay", async () => {
    const recorder = new RecordingAnthropic(
      stubModel({
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 40,
        cache_creation: { ephemeral_1h_input_tokens: 25 },
        server_tool_use: { web_search_requests: 2 },
      }),
    );
    await recorder.create(request);
    const recorded: Usage = recorder.recorded[0].usage;
    expect(recorded).toEqual({
      input: 10,
      output: 20,
      cacheWrite: 30,
      cacheWrite1h: 25,
      cacheRead: 40,
      webSearches: 2,
    });

    const replayed = await new ReplayAnthropic(recorder.recorded).create(request);
    expect(normalizeUsage(replayed.usage)).toEqual(recorded);
  });

  it("replays a turn that used no search and no 1h cache write unchanged", async () => {
    const recorder = new RecordingAnthropic(stubModel({ input_tokens: 1, output_tokens: 2 }));
    await recorder.create(request);
    const replayed = await new ReplayAnthropic(recorder.recorded).create(request);
    expect(normalizeUsage(replayed.usage)).toEqual(recorder.recorded[0].usage);
    expect(normalizeUsage(replayed.usage)).not.toHaveProperty("webSearches");
  });
});
