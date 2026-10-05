import { athensDateTime, describeMeetingDate, describeNow, relativeDayLabel } from "../dates";

describe("dates", () => {
  // 2026-09-23 is a Wednesday. 19:00 Athens (EEST, UTC+3) is 16:00Z.
  const meeting = new Date("2026-09-23T16:00:00.000Z");

  it("renders the weekday and the Athens clock", () => {
    expect(athensDateTime(meeting)).toBe("Τετάρτη 23/09/2026 19:00 ώρα Αθήνας");
  });

  it("labels the relative day by Athens calendar days, not by 24h spans", () => {
    // 23:30 Athens on the 23rd is 20:30Z.
    expect(relativeDayLabel(meeting, new Date("2026-09-23T20:30:00.000Z"))).toBe("σήμερα");
    // 00:30 Athens on the 24th is still 21:30Z on the 23rd — a new day for the reader.
    expect(relativeDayLabel(meeting, new Date("2026-09-23T21:30:00.000Z"))).toBe("χθες");
    expect(relativeDayLabel(meeting, new Date("2026-09-26T06:00:00.000Z"))).toBe("πριν 3 ημέρες");
    expect(relativeDayLabel(meeting, new Date("2026-09-22T06:00:00.000Z"))).toBe("αύριο");
    expect(relativeDayLabel(meeting, new Date("2026-09-18T06:00:00.000Z"))).toBe("σε 5 ημέρες");
  });

  it("describes a meeting date for the event block, and passes garbage through", () => {
    expect(describeMeetingDate("2026-09-23T16:00:00.000Z", new Date("2026-09-25T06:00:00.000Z"))).toBe(
      "Τετάρτη 23/09/2026 19:00 ώρα Αθήνας, πριν 2 ημέρες",
    );
    expect(describeMeetingDate("not a date", new Date())).toBe("not a date");
  });

  it("winter time: 10:00Z is 12:00 Athens", () => {
    expect(athensDateTime(new Date("2026-12-07T10:00:00.000Z"))).toBe("Δευτέρα 07/12/2026 12:00 ώρα Αθήνας");
  });

  it("the clock line keeps the ISO instant and adds the Athens reading", () => {
    expect(describeNow(new Date("2026-03-10T10:00:00.000Z"))).toBe(
      "2026-03-10T10:00:00.000Z — Τρίτη 10/03/2026 12:00 ώρα Αθήνας",
    );
  });
});

describe("describeMeetingDate — values without a clock", () => {
  it("omits the clock for a date-only value and for a midnight-UTC instant", () => {
    const now = new Date("2026-03-10T10:00:00.000Z");
    expect(describeMeetingDate("2026-03-09", now)).toBe("Δευτέρα 09/03/2026, χθες");
    expect(describeMeetingDate("2026-03-09T00:00:00.000Z", now)).toBe("Δευτέρα 09/03/2026, χθες");
    expect(describeMeetingDate("2026-03-09T16:00:00.000Z", now)).toBe(
      "Δευτέρα 09/03/2026 18:00 ώρα Αθήνας, χθες",
    );
  });
});
