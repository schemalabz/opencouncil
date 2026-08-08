import { addUsage, emptyUsage, usageToCost } from "../pricing";

describe("pricing", () => {
  it("prices each token class at sonnet-5 rates", () => {
    expect(usageToCost({ input: 1_000_000, output: 0, cacheWrite: 0, cacheRead: 0 })).toBe(3);
    expect(usageToCost({ input: 0, output: 1_000_000, cacheWrite: 0, cacheRead: 0 })).toBe(15);
    expect(usageToCost({ input: 0, output: 0, cacheWrite: 1_000_000, cacheRead: 0 })).toBe(6);
    expect(usageToCost({ input: 0, output: 0, cacheWrite: 0, cacheRead: 1_000_000 })).toBe(0.3);
  });

  it("addUsage sums fields", () => {
    const sum = addUsage(
      { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 },
      { input: 10, output: 20, cacheWrite: 30, cacheRead: 40 },
    );
    expect(sum).toEqual({ input: 11, output: 22, cacheWrite: 33, cacheRead: 44 });
    expect(usageToCost(emptyUsage())).toBe(0);
  });
});
