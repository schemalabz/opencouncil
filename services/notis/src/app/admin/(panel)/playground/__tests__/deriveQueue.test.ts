import { deriveQueue, insertChronological } from "../deriveQueue";
import { WakeRecord } from "../types";

const meetings = [
  { id: "m1", cityId: "athens", name: "ΔΣ Μαΐου", dateTime: "2026-05-10T18:00:00.000Z" },
  { id: "m2", cityId: "athens", name: "ΔΣ Ιουνίου", dateTime: "2026-06-05T18:00:00.000Z" },
  { id: "p1", cityId: "patras", name: "ΔΣ Πάτρας", dateTime: "2026-05-20T18:00:00.000Z" },
];

describe("deriveQueue", () => {
  it("emits one summary event (+1d) per meeting, merged chronologically", () => {
    const queue = deriveQueue(meetings, "2026-05-01");
    expect(queue.map((q) => q.id)).toEqual([
      "athens:m1:summary",
      "patras:p1:summary",
      "athens:m2:summary",
    ]);
    expect(queue[0].event.at).toBe("2026-05-11T18:00:00.000Z");
    expect(queue.every((q) => q.status === "pending")).toBe(true);
    expect(queue.every((q) => "brief" in q.event && (q.event.brief as { pending: boolean }).pending)).toBe(true);
  });

  // The archive holds only the post-meeting state, so a simulated agenda wake
  // would preview a meeting whose outcomes it can already read.
  it("never emits a pre-meeting agenda event", () => {
    const queue = deriveQueue(meetings, "2020-01-01");
    expect(queue.every((q) => q.event.type === "meeting_summarized")).toBe(true);
  });

  it("clips events before the start date but has no end bound", () => {
    const queue = deriveQueue(meetings, "2026-05-12");
    // m1's summary (05-11) is before the start; everything later stays.
    expect(queue.map((q) => q.id)).toEqual(["patras:p1:summary", "athens:m2:summary"]);
  });

  it("insertChronological places items before later pending events", () => {
    const queue = deriveQueue(meetings, "2026-05-01");
    const item: WakeRecord = {
      id: "sched-1",
      event: { type: "scheduled", at: "2026-05-15T00:00:00.000Z", reason: "check" },
      status: "pending",
    };
    const next = insertChronological(queue, item);
    const idx = next.findIndex((q) => q.id === "sched-1");
    expect(next[idx - 1].id).toBe("athens:m1:summary");
    expect(next[idx + 1].id).toBe("patras:p1:summary");
  });
});
