import { addUsage, emptyUsage, normalizeUsage, usageToCost } from "../pricing";

describe("pricing", () => {
  it("prices each token class at sonnet-5 rates", () => {
    expect(usageToCost({ input: 1_000_000, output: 0, cacheWrite: 0, cacheRead: 0 })).toBe(3);
    expect(usageToCost({ input: 0, output: 1_000_000, cacheWrite: 0, cacheRead: 0 })).toBe(15);
    expect(usageToCost({ input: 0, output: 0, cacheWrite: 1_000_000, cacheRead: 0 })).toBe(6);
    expect(usageToCost({ input: 0, output: 0, cacheWrite: 0, cacheRead: 1_000_000 })).toBe(0.3);
  });

  it("prices by the model that ran, defaulting to sonnet-5", () => {
    const oneMTokIn = { input: 1_000_000, output: 0, cacheWrite: 0, cacheRead: 0 };
    expect(usageToCost(oneMTokIn, "claude-opus-5")).toBe(5);
    expect(usageToCost(oneMTokIn, "claude-haiku-4-5-20251001")).toBe(1);
    expect(usageToCost(oneMTokIn, "claude-sonnet-5")).toBe(3);
    expect(usageToCost(oneMTokIn, "some-unknown-model")).toBe(3);
    expect(usageToCost({ input: 0, output: 1_000_000, cacheWrite: 0, cacheRead: 0 }, "claude-opus-5")).toBe(25);
  });

  it("prices web searches per request, on top of the tokens", () => {
    const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, webSearches: 3 };
    expect(usageToCost(usage)).toBeCloseTo(0.03, 10);
    // The per-request price does not move with the model.
    expect(usageToCost(usage, "claude-opus-5")).toBeCloseTo(0.03, 10);
  });

  it("normalizeUsage carries web searches, and omits the field when none ran", () => {
    expect(
      normalizeUsage({
        input_tokens: 1,
        output_tokens: 2,
        server_tool_use: { web_search_requests: 2 },
      }).webSearches,
    ).toBe(2);
    expect(
      normalizeUsage({ input_tokens: 1, output_tokens: 2 }),
    ).not.toHaveProperty("webSearches");
  });

  it("addUsage sums fields", () => {
    const sum = addUsage(
      { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 },
      { input: 10, output: 20, cacheWrite: 30, cacheRead: 40 },
    );
    expect(sum).toEqual({ input: 11, output: 22, cacheWrite: 33, cacheRead: 44 });
    expect(usageToCost(emptyUsage())).toBe(0);
    expect(
      addUsage(
        { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, webSearches: 1 },
        { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, webSearches: 2 },
      ).webSearches,
    ).toBe(3);
  });
});
