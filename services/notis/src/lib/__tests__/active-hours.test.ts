import {
  QUIET_RELEASE_JITTER_MS,
  activePhase,
  athensHour,
  clampToActiveHours,
  isQuietHour,
} from "../active-hours";

/**
 * Athens is UTC+3 in summer (EEST), UTC+2 in winter (EET). DST switches:
 * 2026-03-29 03:00→04:00 (spring), 2026-10-25 04:00→03:00 (fall).
 */

const rngZero = () => 0;

describe("isQuietHour", () => {
  it("marks the 23:00–09:00 Athens stretch quiet, boundaries exact (summer, UTC+3)", () => {
    expect(isQuietHour(new Date("2026-08-17T19:59:00.000Z"))).toBe(false); // 22:59 Athens
    expect(isQuietHour(new Date("2026-08-17T20:00:00.000Z"))).toBe(true); // 23:00
    expect(isQuietHour(new Date("2026-08-18T05:59:00.000Z"))).toBe(true); // 08:59
    expect(isQuietHour(new Date("2026-08-18T06:00:00.000Z"))).toBe(false); // 09:00
  });

  it("uses the winter offset after DST ends (UTC+2)", () => {
    expect(isQuietHour(new Date("2026-12-01T20:59:00.000Z"))).toBe(false); // 22:59 Athens
    expect(isQuietHour(new Date("2026-12-01T21:00:00.000Z"))).toBe(true); // 23:00
    expect(isQuietHour(new Date("2026-12-02T07:00:00.000Z"))).toBe(false); // 09:00
  });
});

describe("clampToActiveHours", () => {
  it("passes active-hour instants through unchanged", () => {
    const noon = new Date("2026-08-17T09:00:00.000Z"); // 12:00 Athens
    expect(clampToActiveHours(noon, rngZero)).toBe(noon);
  });

  it("holds an evening send until 09:00 the NEXT morning", () => {
    const lateEvening = new Date("2026-08-17T20:30:00.000Z"); // 23:30 Athens
    const released = clampToActiveHours(lateEvening, rngZero);
    expect(released.toISOString()).toBe("2026-08-18T06:00:00.000Z"); // 09:00 Athens
    expect(athensHour(released)).toBe(9);
  });

  it("holds a small-hours send until 09:00 the SAME morning", () => {
    const night = new Date("2026-08-18T01:15:00.000Z"); // 04:15 Athens
    const released = clampToActiveHours(night, rngZero);
    expect(released.toISOString()).toBe("2026-08-18T06:00:00.000Z");
  });

  it("releases at a summer-time 09:00 across the spring-forward night", () => {
    // 2026-03-29 02:30 Athens (EET, UTC+2) — the clocks jump at 03:00.
    const beforeJump = new Date("2026-03-29T00:30:00.000Z");
    const released = clampToActiveHours(beforeJump, rngZero);
    // 09:00 Athens that morning is EEST = 06:00Z.
    expect(released.toISOString()).toBe("2026-03-29T06:00:00.000Z");
    expect(athensHour(released)).toBe(9);
  });

  it("releases at a winter-time 09:00 across the fall-back night", () => {
    // 2026-10-25 02:30 Athens (EEST, UTC+3) — the clocks fall back at 04:00.
    const beforeFallBack = new Date("2026-10-24T23:30:00.000Z");
    const released = clampToActiveHours(beforeFallBack, rngZero);
    // 09:00 Athens that morning is EET = 07:00Z.
    expect(released.toISOString()).toBe("2026-10-25T07:00:00.000Z");
    expect(athensHour(released)).toBe(9);
  });

  it("spreads the release inside the jitter window", () => {
    const night = new Date("2026-08-18T01:00:00.000Z");
    const base = clampToActiveHours(night, rngZero).getTime();
    const jittered = clampToActiveHours(night, () => 0.999).getTime();
    expect(jittered).toBeGreaterThan(base);
    expect(jittered - base).toBeLessThan(QUIET_RELEASE_JITTER_MS);
    expect(athensHour(new Date(jittered))).toBe(9);
  });
});

describe("activePhase", () => {
  it("active afternoons end at the coming 23:00 Athens", () => {
    const noon = new Date("2026-08-18T09:00:00.000Z"); // 12:00 Athens
    const phase = activePhase(noon);
    expect(phase.phase).toBe("active");
    expect(phase.until.toISOString()).toBe("2026-08-18T20:00:00.000Z"); // 23:00 EEST
    expect(athensHour(phase.until)).toBe(23);
  });

  it("quiet nights end at the 09:00 release, jitter-free", () => {
    const night = new Date("2026-08-18T01:15:00.000Z"); // 04:15 Athens
    const phase = activePhase(night);
    expect(phase.phase).toBe("quiet");
    expect(phase.until.toISOString()).toBe("2026-08-18T06:00:00.000Z");
  });

  it("a winter afternoon points at the EET 23:00", () => {
    const winterNoon = new Date("2026-12-01T10:00:00.000Z"); // 12:00 Athens EET
    const phase = activePhase(winterNoon);
    expect(phase.phase).toBe("active");
    expect(phase.until.toISOString()).toBe("2026-12-01T21:00:00.000Z");
  });
});
