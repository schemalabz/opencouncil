import { deriveQueue, insertChronological } from "../deriveQueue";
import { QueueItem } from "../types";

const meetings = [
  { id: "m1", cityId: "athens", name: "ΔΣ Μαΐου", dateTime: "2026-05-10T18:00:00.000Z" },
  { id: "m2", cityId: "athens", name: "ΔΣ Ιουνίου", dateTime: "2026-06-05T18:00:00.000Z" },
  { id: "p1", cityId: "patras", name: "ΔΣ Πάτρας", dateTime: "2026-05-20T18:00:00.000Z" },
];

describe("deriveQueue", () => {
  it("emits agenda (−3d) and summary (+1d) events per meeting, merged chronologically", () => {
    const queue = deriveQueue(meetings, "2026-05-01", "2026-06-30");
    expect(queue.map((q) => q.id)).toEqual([
      "athens:m1:agenda",
      "athens:m1:summary",
      "patras:p1:agenda",
      "patras:p1:summary",
      "athens:m2:agenda",
      "athens:m2:summary",
    ]);
    expect(queue[0].event.at).toBe("2026-05-07T18:00:00.000Z");
    expect(queue[1].event.at).toBe("2026-05-11T18:00:00.000Z");
    expect(queue.every((q) => q.status === "pending")).toBe(true);
    expect(queue.every((q) => "brief" in q.event && (q.event.brief as { pending: boolean }).pending)).toBe(true);
  });

  it("clips events outside the range", () => {
    const queue = deriveQueue(meetings, "2026-05-09", "2026-05-15");
    // m1 agenda (05-07) is out; m1 summary (05-11) is in; p1 agenda (05-17) is out.
    expect(queue.map((q) => q.id)).toEqual(["athens:m1:summary"]);
  });

  it("insertChronological places items before later pending events", () => {
    const queue = deriveQueue(meetings, "2026-05-01", "2026-06-30");
    const item: QueueItem = {
      id: "sched-1",
      event: { type: "scheduled", at: "2026-05-15T00:00:00.000Z", reason: "check" },
      status: "pending",
    };
    const next = insertChronological(queue, item);
    const idx = next.findIndex((q) => q.id === "sched-1");
    expect(next[idx - 1].id).toBe("athens:m1:summary");
    expect(next[idx + 1].id).toBe("patras:p1:agenda");
  });
});
