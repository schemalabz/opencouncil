import { enrollmentOriginFor, isHeldForMarketing, parseCutoff } from "../enrollment";

const CUTOFF = new Date("2026-09-10T12:00:00.000Z");

describe("enrollmentOriginFor", () => {
  it("everyone is a signup when no cutoff is set", () => {
    expect(enrollmentOriginFor(new Date("2025-01-01"), undefined)).toBe("signup");
  });

  it("an account from before the cutoff moves over; one from the cutoff on signed up here", () => {
    expect(enrollmentOriginFor(new Date("2026-09-10T11:59:59.000Z"), CUTOFF)).toBe("transition");
    expect(enrollmentOriginFor(CUTOFF, CUTOFF)).toBe("signup");
    expect(enrollmentOriginFor(new Date("2026-09-11"), CUTOFF)).toBe("signup");
  });
});

describe("parseCutoff", () => {
  it("reads an ISO instant and ignores garbage", () => {
    expect(parseCutoff("2026-09-10T12:00:00.000Z")).toEqual(CUTOFF);
    expect(parseCutoff(undefined)).toBeUndefined();
    expect(parseCutoff("")).toBeUndefined();
    expect(parseCutoff("next tuesday")).toBeUndefined();
  });
});

describe("isHeldForMarketing", () => {
  it("holds a +1 number only while its shell is a marketing template", () => {
    // Meta refuses marketing shells to +1 numbers (131049); utility shells go.
    expect(isHeldForMarketing("notis_intro", "+16174613635")).toBe(true);
    expect(isHeldForMarketing("demos_transition", "+16174613635")).toBe(false);
    expect(isHeldForMarketing("notis_intro", "+306943472297")).toBe(false);
  });
});
