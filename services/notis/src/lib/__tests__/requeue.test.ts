import { REQUEUE_LIMIT, planRequeue, requeueFailedWakes, type RequeueCandidate } from "../requeue";
import type { Db } from "../queue-core";

const at = (iso: string) => new Date(iso);

function candidate(over: Partial<RequeueCandidate> & { id: string }): RequeueCandidate {
  return {
    subscriptionId: "sub1",
    lane: "batch",
    events: [{ type: "agenda_processed", id: over.id }],
    updatedAt: at("2026-09-10T12:00:00.000Z"),
    ...over,
  };
}

describe("planRequeue", () => {
  it("re-opens a failed row that holds no slot, with its own events", () => {
    const plan = planRequeue([candidate({ id: "q1" })], new Map(), REQUEUE_LIMIT);

    expect(plan.revive).toEqual([{ id: "q1", events: [{ type: "agenda_processed", id: "q1" }] }]);
    expect(plan.appendTo).toEqual([]);
    expect(plan.close).toEqual([]);
    expect(plan.skipped).toBe(0);
  });

  it("re-opens the newest of a group and folds its siblings into it", () => {
    // Two pending rows for one subscription and lane would break the partial
    // unique index, so the group has to arrive as one row.
    const plan = planRequeue(
      [
        candidate({ id: "old", updatedAt: at("2026-09-10T09:00:00.000Z") }),
        candidate({ id: "new", updatedAt: at("2026-09-10T11:00:00.000Z") }),
      ],
      new Map(),
      REQUEUE_LIMIT,
    );

    expect(plan.revive).toEqual([
      {
        id: "new",
        events: [
          { type: "agenda_processed", id: "new" },
          { type: "agenda_processed", id: "old" },
        ],
      },
    ]);
    expect(plan.close).toEqual(["old"]);
  });

  it("gives the events to the pending row when one already holds the slot", () => {
    const plan = planRequeue(
      [candidate({ id: "q1" }), candidate({ id: "q2", updatedAt: at("2026-09-10T08:00:00.000Z") })],
      new Map([["sub1:batch", "already-pending"]]),
      REQUEUE_LIMIT,
    );

    expect(plan.revive).toEqual([]);
    expect(plan.appendTo).toEqual([
      {
        id: "already-pending",
        events: [
          { type: "agenda_processed", id: "q1" },
          { type: "agenda_processed", id: "q2" },
        ],
      },
    ]);
    expect(plan.close).toEqual(["q1", "q2"]);
  });

  it("treats the two lanes of one subscription as separate slots", () => {
    const plan = planRequeue(
      [candidate({ id: "b" }), candidate({ id: "l", lane: "live" })],
      new Map([["sub1:batch", "already-pending"]]),
      REQUEUE_LIMIT,
    );

    expect(plan.revive).toEqual([{ id: "l", events: [{ type: "agenda_processed", id: "l" }] }]);
    expect(plan.appendTo.map((a) => a.id)).toEqual(["already-pending"]);
  });

  it("stops at the ceiling and reports what it left", () => {
    const plan = planRequeue(
      [
        candidate({ id: "a", subscriptionId: "s1" }),
        candidate({ id: "b", subscriptionId: "s2" }),
        candidate({ id: "c", subscriptionId: "s3" }),
      ],
      new Map(),
      2,
    );

    expect(plan.revive).toHaveLength(2);
    expect(plan.skipped).toBe(1);
  });
});

/** Records every where clause the module sends, so the promise that it only
 *  touches failed rows is checked at the boundary rather than by reading. */
function recordingDb(failed: unknown[], pending: unknown[]) {
  const findWhere: unknown[] = [];
  const updateWhere: unknown[] = [];
  const raw: string[] = [];
  let call = 0;
  const db = {
    notisWakeQueue: {
      findMany: async ({ where }: { where: unknown }) => {
        findWhere.push(where);
        return call++ === 0 ? failed : pending;
      },
      updateMany: async ({ where }: { where: unknown }) => {
        updateWhere.push(where);
        return { count: 1 };
      },
    },
    $executeRaw: async (strings: TemplateStringsArray) => {
      raw.push(strings.join("?"));
      return 1;
    },
  } as unknown as Db;
  return { db, findWhere, updateWhere, raw };
}

describe("requeueFailedWakes", () => {
  const since = at("2026-09-10T00:00:00.000Z");

  it("reads only failed rows inside the window, and writes only to failed rows", async () => {
    const { db, findWhere, updateWhere } = recordingDb(
      [
        { id: "q1", subscriptionId: "s1", lane: "batch", events: [1], updatedAt: at("2026-09-10T10:00:00.000Z") },
        { id: "q2", subscriptionId: "s1", lane: "batch", events: [2], updatedAt: at("2026-09-10T09:00:00.000Z") },
      ],
      [],
    );

    const result = await requeueFailedWakes(db, { since, now: () => at("2026-09-10T13:00:00.000Z") });

    expect(findWhere[0]).toEqual({ status: "failed", updatedAt: { gte: since } });
    // Every write names the status it expects to find, so a row the drain
    // took back between the read and the write is left where it is.
    expect(updateWhere).toEqual([
      { id: "q1", status: "failed" },
      { id: "q2", status: "failed" },
    ]);
    expect(result).toEqual({ matched: 2, revived: 1, folded: 1, skipped: 0 });
  });

  it("appends to the pending row under its own status guard, and never re-opens it", async () => {
    const { db, updateWhere, raw } = recordingDb(
      [{ id: "q1", subscriptionId: "s1", lane: "live", events: [1], updatedAt: at("2026-09-10T10:00:00.000Z") }],
      [{ id: "p1", subscriptionId: "s1", lane: "live" }],
    );

    const result = await requeueFailedWakes(db, { since });

    expect(raw.join(" ")).toContain("status = 'pending'");
    expect(updateWhere).toEqual([{ id: "q1", status: "failed" }]);
    expect(result).toMatchObject({ revived: 0, folded: 1 });
  });

  it("does nothing at all when the window holds no failures", async () => {
    const { db, updateWhere, raw } = recordingDb([], []);

    expect(await requeueFailedWakes(db, { since })).toEqual({
      matched: 0,
      revived: 0,
      folded: 0,
      skipped: 0,
    });
    expect(updateWhere).toEqual([]);
    expect(raw).toEqual([]);
  });
});
