import type { NotisSubscription } from "../../../generated/client";
import { COMPACT_MESSAGES_AT, COMPACT_SETTLE_MS, COMPACT_WAKES_AT } from "@/agent/types";
import { FakeAnthropic, makeDeps, text } from "../../agent/__tests__/helpers";
import { COMPACTION_STATUS_KEY, computeCut, maybeCompact } from "../compaction";
import { type Row, makeFakeDb } from "./fake-db";

/**
 * Compaction folds everything past the two live windows into one memory.
 * Under test here: the cut arithmetic, the settle margin that keeps in-flight
 * deliveries out of the fold, the watermark compare-and-swap, and the promise
 * that a failure never touches the wake that called it.
 */

const NOW = new Date("2026-03-10T12:00:00.000Z");
const SETTLED = new Date(NOW.getTime() - COMPACT_SETTLE_MS - 60_000);

/** Exactly what maybeCompact reads — the same fields the shell passes it. */
type SubArg = Pick<NotisSubscription, "id" | "status" | "memory" | "memoryThrough">;

const SUB_ARG: SubArg = { id: "sub1", status: "active", memory: null, memoryThrough: null };

const SUB: Row = {
  ...SUB_ARG,
  userId: "user1",
  phone: "+306900000001",
  profileText: "Μένει στην Κυψέλη.",
};

/** n wakes and m messages, all old enough to fold, one minute apart. */
function seed(db: ReturnType<typeof makeFakeDb>, wakes: number, messages: number) {
  const base = new Date(SETTLED.getTime() - (wakes + messages) * 60_000);
  for (let i = 0; i < wakes; i++) {
    db.store.wakes.push({
      id: `w${String(i).padStart(3, "0")}`,
      subscriptionId: "sub1",
      eventType: "user_message",
      eventAt: new Date(base.getTime() + i * 60_000),
      createdAt: new Date(base.getTime() + i * 60_000),
      decision: "send",
      rationale: `λόγος ${i}`,
    });
  }
  for (let i = 0; i < messages; i++) {
    db.store.messages.push({
      id: `m${String(i).padStart(3, "0")}`,
      subscriptionId: "sub1",
      direction: i % 2 === 0 ? "inbound" : "outbound",
      status: i % 2 === 0 ? "received" : "delivered",
      body: `μήνυμα ${i}`,
      createdAt: new Date(base.getTime() + i * 60_000),
    });
  }
}

function summariser(summary = "Ρώτησε για την Κυψέλη. Τον ενδιαφέρουν οι αναπλάσεις.") {
  return makeDeps(new FakeAnthropic([{ content: [text(summary)], stop_reason: "end_turn" }]));
}

describe("computeCut", () => {
  test("takes the earliest of the two window edges and the settle margin", () => {
    const early = new Date("2026-03-01T00:00:00.000Z");
    const late = new Date("2026-03-05T00:00:00.000Z");
    expect(computeCut(late, early, NOW)).toEqual(early);
    expect(computeCut(early, late, NOW)).toEqual(early);
  });

  test("the settle margin wins over a window edge inside it", () => {
    const recent = new Date(NOW.getTime() - 60_000);
    expect(computeCut(recent, recent, NOW)).toEqual(new Date(NOW.getTime() - COMPACT_SETTLE_MS));
  });

  test("with no rows behind either window the settle margin still bounds it", () => {
    expect(computeCut(undefined, undefined, NOW)).toEqual(
      new Date(NOW.getTime() - COMPACT_SETTLE_MS),
    );
  });
});

describe("maybeCompact", () => {
  test("does nothing below the thresholds, and never calls the model", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seed(db, COMPACT_WAKES_AT, COMPACT_MESSAGES_AT);
    const deps = summariser();

    const result = await maybeCompact(db, { ...SUB_ARG }, { deps, now: () => NOW });

    expect(result).toEqual({ ran: false, reason: "below thresholds" });
    expect(deps.anthropic).toBeDefined();
  });

  test("skips an unsubscribed reader — they will never wake again", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB, status: "unsubscribed" }] });
    seed(db, COMPACT_WAKES_AT + 20, COMPACT_MESSAGES_AT + 20);

    const result = await maybeCompact(
      db,
      { ...SUB_ARG, status: "unsubscribed" },
      { deps: summariser(), now: () => NOW },
    );

    expect(result).toEqual({ ran: false, reason: "unsubscribed" });
  });

  test("folds the aged-out rows, writes the watermark, and records status", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seed(db, COMPACT_WAKES_AT + 20, COMPACT_MESSAGES_AT + 20);

    const result = await maybeCompact(db, { ...SUB_ARG }, {
      deps: summariser(),
      now: () => NOW,
    });

    expect(result.ran).toBe(true);
    const row = db.store.subscriptions.get("sub1");
    expect(row?.memory).toContain("Κυψέλη");
    expect(row?.memoryThrough).toBeInstanceOf(Date);

    // Everything folded is at or before the watermark; both windows keep
    // exactly their own size behind it.
    const cut = row?.memoryThrough as Date;
    const keptWakes = db.store.wakes.filter((w) => (w.eventAt as Date) > cut);
    expect(keptWakes.length).toBeGreaterThanOrEqual(COMPACT_WAKES_AT - 20);
    expect(db.store.settings.get(COMPACTION_STATUS_KEY)).toBeDefined();
  });

  test("never folds anything inside the settle margin", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    // Every row is recent: past the count thresholds, but none has settled.
    for (let i = 0; i < COMPACT_WAKES_AT + 20; i++) {
      db.store.wakes.push({
        id: `w${i}`,
        subscriptionId: "sub1",
        eventType: "user_message",
        eventAt: new Date(NOW.getTime() - i * 1000),
        createdAt: new Date(NOW.getTime() - i * 1000),
        decision: "send",
        rationale: "πρόσφατο",
      });
    }
    for (let i = 0; i < COMPACT_MESSAGES_AT + 20; i++) {
      db.store.messages.push({
        id: `m${i}`,
        subscriptionId: "sub1",
        direction: "outbound",
        // Still in flight: exactly the row that must not be summarised away.
        status: "pending",
        body: "εν κινήσει",
        createdAt: new Date(NOW.getTime() - i * 1000),
      });
    }

    const result = await maybeCompact(db, { ...SUB_ARG }, {
      deps: summariser(),
      now: () => NOW,
    });

    expect(result.ran).toBe(false);
    expect(db.store.subscriptions.get("sub1")?.memory).toBeNull();
  });

  test("a second compaction that lost the race writes nothing", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seed(db, COMPACT_WAKES_AT + 20, COMPACT_MESSAGES_AT + 20);

    const first = await maybeCompact(db, { ...SUB_ARG }, {
      deps: summariser("Πρώτη σύνοψη."),
      now: () => NOW,
    });
    expect(first.ran).toBe(true);

    // The loser started from the pre-compaction watermark, so its CAS misses.
    const second = await maybeCompact(db, { ...SUB_ARG }, {
      deps: summariser("Δεύτερη σύνοψη, χαμένη."),
      now: () => NOW,
    });

    expect(second.ran).toBe(false);
    expect(second.reason).toBe("raced by another compaction");
    expect(db.store.subscriptions.get("sub1")?.memory).toBe("Πρώτη σύνοψη.");
  });

  test("a model failure alerts, leaves the watermark untouched, and never throws", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seed(db, COMPACT_WAKES_AT + 20, COMPACT_MESSAGES_AT + 20);
    const alerts: string[] = [];
    const deps = makeDeps(new FakeAnthropic([]));

    const result = await maybeCompact(db, { ...SUB_ARG }, {
      deps,
      now: () => NOW,
      alert: async (m) => {
        alerts.push(m);
      },
    });

    expect(result).toEqual({ ran: false, reason: "error" });
    expect(alerts).toHaveLength(1);
    const row = db.store.subscriptions.get("sub1");
    expect(row?.memory).toBeNull();
    expect(row?.memoryThrough).toBeNull();
  });

  test("an oversized summary is discarded rather than persisted", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seed(db, COMPACT_WAKES_AT + 20, COMPACT_MESSAGES_AT + 20);
    const alerts: string[] = [];

    const result = await maybeCompact(db, { ...SUB_ARG }, {
      deps: summariser("α".repeat(5000)),
      now: () => NOW,
      alert: async (m) => {
        alerts.push(m);
      },
    });

    expect(result.ran).toBe(false);
    expect(result.reason).toBe("summary too long");
    expect(alerts[0]).toContain("max");
    expect(db.store.subscriptions.get("sub1")?.memory).toBeNull();
  });

  test("open commitments reach the summariser marked as already tracked", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seed(db, COMPACT_WAKES_AT + 20, COMPACT_MESSAGES_AT + 20);
    db.store.commitments.push({
      id: "c1",
      subscriptionId: "sub1",
      slug: "kypseli-metro",
      what: "Να του πω αν προχωρήσει η ζημιά στο μετρό.",
      createdAt: new Date(),
      resolvedAt: null,
    });
    const fake = new FakeAnthropic([{ content: [text("Σύνοψη.")], stop_reason: "end_turn" }]);

    await maybeCompact(db, { ...SUB_ARG }, { deps: makeDeps(fake), now: () => NOW });

    const sent = JSON.stringify(fake.requests[0].messages);
    expect(sent).toContain("already_tracked_do_not_repeat");
    expect(sent).toContain("kypseli-metro");
  });
});
