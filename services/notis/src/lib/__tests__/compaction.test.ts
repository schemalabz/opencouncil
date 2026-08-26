import type { NotisSubscription } from "../../../generated/client";
import {
  COMPACT_MESSAGES_AT,
  COMPACT_SETTLE_MS,
  COMPACT_WAKES_AT,
  CONVERSATION_WINDOW,
  MEMORY_MAX_CHARS,
} from "@/agent/types";
import { FakeAnthropic, makeDeps, text } from "../../agent/__tests__/helpers";
import {
  COMPACTION_STATUS_KEY,
  computeCut,
  maybeCompact,
  truncateAtBoundary,
} from "../compaction";
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
  const over = (edge: Date, window: number): { count: number; edge: Date } => ({
    count: window + 10,
    edge,
  });

  test("takes the earliest of the two window edges and the settle margin", () => {
    const early = new Date("2026-03-01T00:00:00.000Z");
    const late = new Date("2026-03-05T00:00:00.000Z");
    expect(
      computeCut(over(late, COMPACT_WAKES_AT), over(early, COMPACT_MESSAGES_AT), NOW),
    ).toEqual(early);
    expect(
      computeCut(over(early, COMPACT_WAKES_AT), over(late, COMPACT_MESSAGES_AT), NOW),
    ).toEqual(early);
  });

  test("the settle margin wins over a window edge inside it", () => {
    const recent = new Date(NOW.getTime() - 60_000);
    expect(
      computeCut(over(recent, COMPACT_WAKES_AT), over(recent, COMPACT_MESSAGES_AT), NOW),
    ).toEqual(new Date(NOW.getTime() - COMPACT_SETTLE_MS));
  });

  test("an empty stream has nothing to lose and does not constrain the cut", () => {
    const edge = new Date("2026-03-01T00:00:00.000Z");
    expect(computeCut(over(edge, COMPACT_WAKES_AT), { count: 0 }, NOW)).toEqual(edge);
    expect(computeCut({ count: 0 }, over(edge, COMPACT_MESSAGES_AT), NOW)).toEqual(edge);
  });

  test("a stream with rows but under its window vetoes the fold entirely", () => {
    const edge = new Date("2026-03-01T00:00:00.000Z");
    // The regression: 100 wakes, 20 messages. Every one of those 20 is still
    // inside the 40-message window, so the wake boundary must not fold them —
    // once the watermark passes them they would leave the window for good.
    expect(computeCut(over(edge, COMPACT_WAKES_AT), { count: 20 }, NOW)).toBeNull();
    expect(computeCut({ count: 5 }, over(edge, COMPACT_MESSAGES_AT), NOW)).toBeNull();
    // Exactly at the window is still "all live" — the window keeps all of them.
    expect(
      computeCut(over(edge, COMPACT_WAKES_AT), { count: CONVERSATION_WINDOW }, NOW),
    ).toBeNull();
  });

  test("neither stream past its window means nothing to fold", () => {
    expect(computeCut({ count: 3 }, { count: 4 }, NOW)).toBeNull();
    expect(computeCut({ count: 0 }, { count: 0 }, NOW)).toEqual(
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

  test("an oversized summary earns one corrective retry", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seed(db, COMPACT_WAKES_AT + 20, COMPACT_MESSAGES_AT + 20);
    const fake = new FakeAnthropic([
      { content: [text("α".repeat(5000))], stop_reason: "end_turn" },
      { content: [text("Σύντομη σύνοψη.")], stop_reason: "end_turn" },
    ]);

    const result = await maybeCompact(db, { ...SUB_ARG }, {
      deps: makeDeps(fake),
      now: () => NOW,
    });

    expect(result.ran).toBe(true);
    expect(db.store.subscriptions.get("sub1")?.memory).toBe("Σύντομη σύνοψη.");
    expect(JSON.stringify(fake.requests[1].messages)).toContain("materially shorter");
  });

  test("oversize twice truncates and still advances — never a per-wake retry loop", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seed(db, COMPACT_WAKES_AT + 20, COMPACT_MESSAGES_AT + 20);
    const alerts: string[] = [];
    const long = `${"Μια πρόταση. ".repeat(400)}`;

    const result = await maybeCompact(db, { ...SUB_ARG }, {
      deps: makeDeps(
        new FakeAnthropic([
          { content: [text(long)], stop_reason: "end_turn" },
          { content: [text(long)], stop_reason: "end_turn" },
        ]),
      ),
      now: () => NOW,
      alert: async (m) => {
        alerts.push(m);
      },
    });

    // The watermark MUST move: leaving it means the identical fold is re-sent
    // and re-billed on every future wake for this reader.
    expect(result.ran).toBe(true);
    const row = db.store.subscriptions.get("sub1");
    expect(row?.memoryThrough).toBeInstanceOf(Date);
    const stored = row?.memory as string;
    expect(stored.length).toBeLessThanOrEqual(MEMORY_MAX_CHARS);
    expect(stored.endsWith(".")).toBe(true);
    expect(alerts[0]).toContain("advanced the watermark");
  });

  test("empty twice leaves the watermark for the next wake", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seed(db, COMPACT_WAKES_AT + 20, COMPACT_MESSAGES_AT + 20);
    const alerts: string[] = [];

    const result = await maybeCompact(db, { ...SUB_ARG }, {
      deps: makeDeps(
        new FakeAnthropic([
          { content: [text("")], stop_reason: "end_turn" },
          { content: [text("")], stop_reason: "end_turn" },
        ]),
      ),
      now: () => NOW,
      alert: async (m) => {
        alerts.push(m);
      },
    });

    expect(result.reason).toBe("empty summary");
    expect(alerts[0]).toContain("twice");
    expect(db.store.subscriptions.get("sub1")?.memoryThrough).toBeNull();
  });

  test("truncateAtBoundary cuts on a sentence, not mid-word", () => {
    const text = "Πρώτη πρόταση. Δεύτερη πρόταση. Τρίτη πρόταση που κόβεται.";
    const out = truncateAtBoundary(text, 32);
    expect(out).toBe("Πρώτη πρόταση. Δεύτερη πρόταση.");
    expect(truncateAtBoundary("σύντομο", 100)).toBe("σύντομο");
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

  test("a send the proactive limit held back folds as NOT SENT, never as delivered", async () => {
    // `memory` never ages out, so a message the reader never received must
    // not be summarised into it as one they were told. The live prompt
    // labels these rows; the fold has to label them the same way.
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    // Older than anything seed() writes, so it is inside the folded range
    // rather than the live window the prompt still renders itself.
    db.store.messages.push({
      id: "held",
      subscriptionId: "sub1",
      direction: "outbound",
      status: "suppressed",
      failureReason: "proactive limit",
      body: "ΚΡΑΤΗΜΕΝΟ ΚΕΙΜΕΝΟ",
      createdAt: new Date(SETTLED.getTime() - 24 * 60 * 60_000),
    });
    seed(db, COMPACT_WAKES_AT + 20, COMPACT_MESSAGES_AT + 20);
    const fake = new FakeAnthropic([{ content: [text("Σύνοψη.")], stop_reason: "end_turn" }]);

    await maybeCompact(db, { ...SUB_ARG }, { deps: makeDeps(fake), now: () => NOW });

    const input = String((fake.requests[0].messages[0] as { content: unknown }).content);
    const held = input.split("\n").find((line) => line.includes("ΚΡΑΤΗΜΕΝΟ ΚΕΙΜΕΝΟ"));
    expect(held).toBeDefined();
    expect(held).toContain("NOT SENT (proactive limit");
    // The marker REPLACES the delivered label; it does not sit beside it.
    expect(held).not.toContain("you sent");
  });

  test("a send another rail stopped never reaches the summariser at all", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    db.store.messages.push({
      id: "paused",
      subscriptionId: "sub1",
      direction: "outbound",
      status: "suppressed",
      failureReason: "paused",
      body: "ΠΑΥΜΕΝΟ ΚΕΙΜΕΝΟ",
      createdAt: new Date(SETTLED.getTime() - 24 * 60 * 60_000),
    });
    seed(db, COMPACT_WAKES_AT + 20, COMPACT_MESSAGES_AT + 20);
    const fake = new FakeAnthropic([{ content: [text("Σύνοψη.")], stop_reason: "end_turn" }]);

    await maybeCompact(db, { ...SUB_ARG }, { deps: makeDeps(fake), now: () => NOW });

    const input = String((fake.requests[0].messages[0] as { content: unknown }).content);
    expect(input).not.toContain("ΠΑΥΜΕΝΟ ΚΕΙΜΕΝΟ");
  });
});
