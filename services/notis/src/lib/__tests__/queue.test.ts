import { FakeAnthropic, makeDeps, toolUse } from "../../agent/__tests__/helpers";
import { MAX_ATTEMPTS, type ClaimedItem } from "../queue-core";
import { processItem, resendStalePendingMessages } from "../queue";
import { type Row, makeFakeDb } from "./fake-db";
import { FakeBird } from "./fake-bird";

/**
 * processItem against an in-memory Prisma fake: the shell's ordering
 * invariants (wake committed before Bird, idempotency key = message id,
 * failure → pending retry with Bird untouched) are what's under test —
 * runWake itself has its own suite.
 */


const SUB: Row = {
  id: "sub1",
  userId: "user1",
  phone: "+306900000001",
  status: "active",
  origin: "inbound",
  unsubscribedAt: null,
  birdConversationId: "conv-1",
  profileText: "Μένει στην Κυψέλη.",
  userName: "Μαρία",
};

const ITEM: ClaimedItem = {
  id: "q1",
  subscriptionId: "sub1",
  lane: "live",
  events: [{ type: "user_message", at: "2026-03-10T10:00:00.000Z", text: "Τι ψηφίστηκε χθες;" }],
  attempts: 1,
};

const sendTurn = [
  {
    content: [
      toolUse("t1", "send_message", { text: "Η απάντηση." }),
      toolUse("t2", "finish_wake", { rationale: "Ρώτησε και απάντησα." }),
    ],
    stop_reason: "tool_use",
  },
];

function seedClaim(db: ReturnType<typeof makeFakeDb>, attempts = 1) {
  db.store.queue.set("q1", { id: "q1", status: "running", attempts });
}

describe("processItem", () => {
  it("persists the wake, journal and message BEFORE calling Bird, keyed by the message id", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seedClaim(db);
    const bird = new FakeBird();
    const alerts: string[] = [];

    await processItem(ITEM, {
      db,
      bird,
      deps: makeDeps(new FakeAnthropic(sendTurn)),
      alert: async (m) => {
        alerts.push(m);
      },
    });

    // Everything committed, then exactly one Bird call.
    expect(db.store.wakes).toHaveLength(1);
    expect(db.store.journal).toHaveLength(1);
    expect(db.store.journal[0].seq).toBe(1);
    expect(db.store.queue.get("q1")?.status).toBe("done");
    expect(bird.sends).toHaveLength(1);

    const outbound = db.store.messages.find((m) => m.direction === "outbound")!;
    expect(bird.sends[0]).toEqual({
      conversationId: "conv-1",
      text: "Η απάντηση.",
      idempotencyKey: outbound.id,
    });
    expect(outbound.status).toBe("sent");
    expect(outbound.birdMessageId).toBe("bird-1");
    expect(outbound.deliveryMode).toBe("freeform");

    // Ordering: the wake row and the done-mark precede the send.
    const sendIndex = db.calls.indexOf("message-created:outbound");
    expect(db.calls.indexOf("wake-created")).toBeLessThan(sendIndex);
    expect(alerts).toHaveLength(0);
  });

  it("returns the item to pending when the wake throws — Bird untouched, nothing persisted", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seedClaim(db);
    const bird = new FakeBird();

    await processItem(ITEM, {
      db,
      bird,
      // Zero scripted turns: the model call itself blows up.
      deps: makeDeps(new FakeAnthropic([])),
      alert: async () => {},
    });

    expect(db.store.wakes).toHaveLength(0);
    expect(bird.sends).toHaveLength(0);
    const item = db.store.queue.get("q1");
    expect(item?.status).toBe("pending");
    expect(String(item?.lastError)).toContain("exhausted");
  });

  it("fails terminally past MAX_ATTEMPTS without running the model", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seedClaim(db, MAX_ATTEMPTS + 1);
    const anthropic = new FakeAnthropic(sendTurn);
    const alerts: string[] = [];

    await processItem(
      { ...ITEM, attempts: MAX_ATTEMPTS + 1 },
      { db, bird: new FakeBird(), deps: makeDeps(anthropic), alert: async (m) => { alerts.push(m); } },
    );

    expect(db.store.queue.get("q1")?.status).toBe("failed");
    expect(anthropic.requests).toHaveLength(0);
    expect(alerts).toHaveLength(1);
  });

  it("applies an unsubscribe outcome to the subscription", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seedClaim(db);
    const turns = [
      {
        content: [
          toolUse("t1", "unsubscribe_user", { reason: "Το ζήτησε." }),
          toolUse("t2", "finish_wake", { rationale: "Έφυγε, τον άφησα." }),
        ],
        stop_reason: "tool_use",
      },
    ];

    await processItem(ITEM, {
      db,
      bird: new FakeBird(),
      deps: makeDeps(new FakeAnthropic(turns)),
      alert: async () => {},
    });

    const sub = db.store.subscriptions.get("sub1")!;
    expect(sub.status).toBe("unsubscribed");
    expect(sub.unsubscribedAt).toBeInstanceOf(Date);
    expect(db.store.queue.get("q1")?.status).toBe("done");
  });

  it("marks the message failed and alerts when the Bird send fails — the wake stays committed", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seedClaim(db);
    const bird = new FakeBird({ success: false, error: "window closed" });
    const alerts: string[] = [];

    await processItem(ITEM, {
      db,
      bird,
      deps: makeDeps(new FakeAnthropic(sendTurn)),
      alert: async (m) => {
        alerts.push(m);
      },
    });

    expect(db.store.wakes).toHaveLength(1);
    expect(db.store.queue.get("q1")?.status).toBe("done");
    const outbound = db.store.messages.find((m) => m.direction === "outbound")!;
    expect(outbound.status).toBe("failed");
    expect(alerts.some((m) => m.includes("window closed"))).toBe(true);
  });

  it("keeps the message pending on a transient Bird failure — the sweeper retries it", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seedClaim(db);
    const bird = new FakeBird({ success: false, retryable: true, error: "503 from Bird" });
    const alerts: string[] = [];

    await processItem(ITEM, {
      db,
      bird,
      deps: makeDeps(new FakeAnthropic(sendTurn)),
      alert: async (m) => {
        alerts.push(m);
      },
    });

    const outbound = db.store.messages.find((m) => m.direction === "outbound")!;
    // Still pending with the reason recorded: resendStalePendingMessages
    // will retry it under the same idempotency key.
    expect(outbound.status).toBe("pending");
    expect(outbound.failureReason).toBe("503 from Bird");
    expect(alerts).toHaveLength(0);
  });

  it("aborts without side effects when the claim was reclaimed mid-wake (fence)", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    // The reclaimer bumped attempts: this worker's fence no longer matches.
    db.store.queue.set("q1", { id: "q1", status: "running", attempts: ITEM.attempts + 1 });
    const bird = new FakeBird();

    await processItem(ITEM, {
      db,
      bird,
      deps: makeDeps(new FakeAnthropic(sendTurn)),
      alert: async () => {},
    });

    // The persist tx threw ClaimLostError: nothing landed, nothing sent,
    // and the reclaimer's row was left untouched.
    expect(db.store.wakes).toHaveLength(0);
    expect(db.store.journal).toHaveLength(0);
    expect(bird.sends).toHaveLength(0);
    expect(db.store.queue.get("q1")?.status).toBe("running");
    expect(db.store.queue.get("q1")?.attempts).toBe(ITEM.attempts + 1);
  });
});

describe("per-reader isolation", () => {
  const OTHER: Row = {
    ...SUB,
    id: "sub2",
    userId: "user2",
    phone: "+306900000002",
    birdConversationId: "conv-2",
    userName: "Νίκος",
  };

  it("reads only this reader's journal, seq and last inbound", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }, { ...OTHER }] });
    seedClaim(db);

    // A stranger with a LONGER history than ours, so a seq allocated from
    // their sequence is visibly wrong, and a journal window that includes
    // them is visible in the prompt.
    for (let seq = 1; seq <= 5; seq++) {
      db.store.journal.push({
        id: `j-other-${seq}`,
        subscriptionId: "sub2",
        seq,
        entry: {
          at: "2026-03-09T10:00:00.000Z",
          event: "user_message",
          decision: "silence",
          rationale: "ΞΕΝΗ ΙΣΤΟΡΙΑ",
          messages: [],
        },
      });
    }
    for (let seq = 1; seq <= 2; seq++) {
      db.store.journal.push({
        id: `j-mine-${seq}`,
        subscriptionId: "sub1",
        seq,
        entry: {
          at: "2026-03-09T11:00:00.000Z",
          event: "user_message",
          decision: "silence",
          rationale: "Η ΔΙΚΗ ΜΑΣ ΙΣΤΟΡΙΑ",
          messages: [],
        },
      });
    }
    db.store.messages.push({
      id: "m-other",
      subscriptionId: "sub2",
      direction: "inbound",
      body: "ξένο μήνυμα",
      createdAt: new Date("2026-03-10T09:59:00.000Z"),
    });

    const anthropic = new FakeAnthropic(sendTurn);
    await processItem(ITEM, { db, bird: new FakeBird(), deps: makeDeps(anthropic), alert: async () => {} });

    // The new entry continues OUR sequence (3), not the stranger's (6) — a
    // seq taken from another subscription collides on (subscriptionId, seq).
    const mine = db.store.journal.filter((j) => j.subscriptionId === "sub1");
    expect(Math.max(...mine.map((j) => j.seq as number))).toBe(3);
    // And the stranger's history never reached the model.
    expect(JSON.stringify(anthropic.requests)).not.toContain("ΞΕΝΗ ΙΣΤΟΡΙΑ");
    expect(JSON.stringify(anthropic.requests)).toContain("Η ΔΙΚΗ ΜΑΣ ΙΣΤΟΡΙΑ");
  });
});

describe("resendStalePendingMessages", () => {
  const stalePending = (overrides: Row = {}): Row => ({
    id: "m-stale",
    subscriptionId: "sub1",
    direction: "outbound",
    body: "Η απάντηση.",
    deliveryMode: "freeform",
    status: "pending",
    failureReason: null,
    sendingAt: null,
    createdAt: new Date(Date.now() - 10 * 60_000),
    ...overrides,
  });

  it("claims a row before sending, so an overlapping sweep cannot send it twice", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    db.store.messages.push(stalePending());
    const bird = new FakeBird();

    // Two sweeps racing: the second must find the row claimed and skip it.
    // Bird is asked once, so its idempotency key is never racing itself.
    await Promise.all([
      resendStalePendingMessages({ db, bird, alert: async () => {} }),
      resendStalePendingMessages({ db, bird, alert: async () => {} }),
    ]);

    expect(bird.sends).toHaveLength(1);
    expect(db.store.messages[0].status).toBe("sent");
    // The claim is released with the outcome.
    expect(db.store.messages[0].sendingAt).toBeNull();
  });

  it("leaves a claimed row alone until its claim goes stale", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    db.store.messages.push(stalePending({ sendingAt: new Date() }));
    const bird = new FakeBird();

    await resendStalePendingMessages({ db, bird, alert: async () => {} });

    expect(bird.sends).toHaveLength(0);
  });

  it("never rewrites a send that succeeded into a give-up failure", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    // Past the give-up cutoff, but the send landed in the meantime.
    db.store.messages.push(
      stalePending({ status: "sent", createdAt: new Date(Date.now() - 2 * 60 * 60_000) }),
    );
    const alerts: string[] = [];

    await resendStalePendingMessages({
      db,
      bird: new FakeBird(),
      alert: async (m) => {
        alerts.push(m);
      },
    });

    expect(db.store.messages[0].status).toBe("sent");
    expect(alerts).toHaveLength(0);
  });

  it("clears a stale failureReason when a retry succeeds", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    db.store.messages.push(stalePending({ failureReason: "503 from Bird" }));

    await resendStalePendingMessages({ db, bird: new FakeBird(), alert: async () => {} });

    expect(db.store.messages[0]).toMatchObject({ status: "sent", failureReason: null });
  });
});

