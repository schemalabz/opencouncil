import { blastRadiusExceeded, runJanitor } from "../janitor";

describe("blastRadiusExceeded", () => {
  test("allows at most max(1, 1%) deletions", () => {
    // Small fleets: the floor of one deletion is always allowed.
    expect(blastRadiusExceeded(50, 0)).toBe(false);
    expect(blastRadiusExceeded(50, 1)).toBe(false);
    expect(blastRadiusExceeded(50, 2)).toBe(true);

    // At scale the 1% rule takes over.
    expect(blastRadiusExceeded(1000, 10)).toBe(false);
    expect(blastRadiusExceeded(1000, 11)).toBe(true);

    // A broken view returning nothing looks like deleting everyone.
    expect(blastRadiusExceeded(1000, 1000)).toBe(true);
  });
});

describe("runJanitor", () => {
  test("refuses to run without both database URLs", async () => {
    // jest.setup.js clears NOTIS_DATABASE_URL / MAIN_DATABASE_URL.
    const result = await runJanitor();
    expect(result.ran).toBe(false);
    expect(result.deleted).toBe(0);
  });
});
