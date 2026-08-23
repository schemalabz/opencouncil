import { FakeAnthropic, makeDeps, toolUse } from "../../agent/__tests__/helpers";
import { MAX_ATTEMPTS, type ClaimedItem } from "../queue-core";
import { processItem, resendStalePendingMessages } from "../queue";
import { type Row, makeFakeDb } from "./fake-db";
import { FakeBird } from "./fake-bird";

/**
 * processItem against an in-memory Prisma fake: the shell's ordering
 * invariants are what's under test — runWake itself has its own suite.
 * Reactive wakes deliver INCREMENTALLY (each send goes out mid-loop, the
 * wake row adopts the rows at persistence); everything else keeps the old
 * order (wake committed before Bird, idempotency key = message id,
 * failure → pending retry with Bird untouched).
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
  it("delivers the reply mid-wake, then persists the wake and adopts the rows", async () => {
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

    // Incremental ordering: the reader has the message BEFORE the wake row
    // exists, and the wake adopts the row at persistence.
    const sendIndex = db.calls.indexOf("message-created:outbound");
    expect(sendIndex).toBeLessThan(db.calls.indexOf("wake-created"));
    expect(outbound.wakeId).toBe(db.store.wakes[0].id);
    expect(alerts).toHaveLength(0);
  });

  it("finalizes fail-forward when the model errors after a delivery", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seedClaim(db);
    const bird = new FakeBird();
    const alerts: string[] = [];

    await processItem(ITEM, {
      db,
      bird,
      // Turn 1 sends without finish_wake; turn 2 does not exist, so the
      // model call throws mid-wake — after the reader already got a message.
      deps: makeDeps(
        new FakeAnthropic([
          {
            content: [toolUse("t1", "send_message", { text: "Πρώτο μισό." })],
            stop_reason: "tool_use",
          },
        ]),
      ),
      alert: async (m) => {
        alerts.push(m);
      },
    });

    // Re-running the model after a real delivery risks a duplicate answer,
    // so the error finalizes the wake with what it has instead of retrying.
    expect(bird.sends).toHaveLength(1);
    expect(db.store.wakes).toHaveLength(1);
    const wake = db.store.wakes[0];
    expect(wake.decision).toBe("send");
    expect(
      (wake.outcome as { partialDeliveryError?: string }).partialDeliveryError,
    ).toContain("exhausted");
    expect(db.store.queue.get("q1")?.status).toBe("done");
    const outbound = db.store.messages.find((m) => m.direction === "outbound")!;
    expect(outbound.status).toBe("sent");
    expect(outbound.wakeId).toBe(wake.id);
    expect(alerts.some((m) => m.includes("partial delivery"))).toBe(true);
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

  it("an unsubscribe wake suppresses other pending outbound rows, not its own goodbye", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seedClaim(db);
    // A stale pending row from an earlier wake — the kind the sweeper would
    // otherwise retry and deliver after the reader said goodbye.
    db.store.messages.push({
      id: "stale1",
      subscriptionId: "sub1",
      direction: "outbound",
      body: "Παλιά είδηση.",
      status: "pending",
      createdAt: new Date("2026-03-10T09:00:00.000Z"),
    });
    const bird = new FakeBird();

    await processItem(ITEM, {
      db,
      bird,
      deps: makeDeps(
        new FakeAnthropic([
          {
            content: [
              toolUse("t1", "unsubscribe_user", { reason: "το ζήτησε" }),
              toolUse("t2", "send_message", { text: "Εντάξει, σταματώ. Γεια!" }),
              toolUse("t3", "finish_wake", { rationale: "Ζήτησε διαγραφή." }),
            ],
            stop_reason: "tool_use",
          },
        ]),
      ),
      alert: async () => {},
    });

    const stale = db.store.messages.find((m) => m.id === "stale1")!;
    expect(stale.status).toBe("suppressed");
    expect(stale.failureReason).toBe("unsubscribed");
    // The goodbye itself went out — the reader gets the confirmation.
    const goodbye = db.store.messages.find((m) => m.body === "Εντάξει, σταματώ. Γεια!")!;
    expect(goodbye.status).toBe("sent");
  });

  it("a lost claim aborts the record — delivered bytes stay delivered, with an alert", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    // The reclaimer bumped attempts: this worker's fence no longer matches.
    db.store.queue.set("q1", { id: "q1", status: "running", attempts: ITEM.attempts + 1 });
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

    // The persist tx threw ClaimLostError: no wake row landed and the
    // reclaimer's row was left untouched — it owns the item now.
    expect(db.store.wakes).toHaveLength(0);
    expect(db.store.queue.get("q1")?.status).toBe("running");
    expect(db.store.queue.get("q1")?.attempts).toBe(ITEM.attempts + 1);
    // But the incremental send went out mid-loop and cannot be recalled:
    // the row stays wakeId-less, the reclaimer's run sees it in the
    // conversation, and the alert is the operator's signal.
    expect(bird.sends).toHaveLength(1);
    const outbound = db.store.messages.find((m) => m.direction === "outbound")!;
    expect(outbound.status).toBe("sent");
    expect(outbound.wakeId ?? null).toBeNull();
    expect(alerts.some((m) => m.includes("lost its claim"))).toBe(true);
  });
});

/**
 * The sweeper re-sends rows that stayed pending, which means it delivers
 * long after the wake decided to. The rails have to hold at THAT moment,
 * not only at the send boundary.
 */
describe("resendStalePendingMessages", () => {
  const stalePendingProactive = (overrides: Row = {}): Row => ({
    id: "m-stale",
    subscriptionId: "sub1",
    direction: "outbound",
    body: "Νέα από τον δήμο σου.",
    channel: "whatsapp",
    proactive: true,
    railed: true,
    deliveryMode: "template",
    template: "demos_update_news",
    status: "pending",
    failureReason: null,
    createdAt: new Date(Date.now() - 10 * 60_000),
    ...overrides,
  });

  it("re-sends a stale proactive row when the rails still allow it", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: [{ key: "proactivePaused", value: false }] });
    db.store.messages.push(stalePendingProactive());
    const bird = new FakeBird();

    await resendStalePendingMessages({ db, bird, alert: async () => {} });

    expect(bird.templateSends).toHaveLength(1);
    expect(db.store.messages[0].status).toBe("sent");
  });

  it("suppresses instead of sending when the reader unsubscribed after the row was written", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB, status: "unsubscribed", unsubscribedAt: new Date() }],
      settings: [{ key: "proactivePaused", value: false }],
    });
    db.store.messages.push(stalePendingProactive());
    const bird = new FakeBird();

    await resendStalePendingMessages({ db, bird, alert: async () => {} });

    expect(bird.templateSends).toHaveLength(0);
    expect(db.store.messages[0].status).toBe("suppressed");
    expect(db.store.messages[0].failureReason).toBe("unsubscribed");
  });

  it("suppresses instead of sending while the kill switch is closed", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB }],
      settings: [{ key: "proactivePaused", value: true }],
    });
    db.store.messages.push(stalePendingProactive());
    const bird = new FakeBird();

    await resendStalePendingMessages({ db, bird, alert: async () => {} });

    expect(bird.templateSends).toHaveLength(0);
    expect(db.store.messages[0].status).toBe("suppressed");
    expect(db.store.messages[0].failureReason).toBe("paused");
  });

  it("still re-sends a reactive reply — no rail applies to it", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB }],
      settings: [{ key: "proactivePaused", value: true }],
    });
    // railed: false is the stamp a reactive reply carries from creation —
    // freeform mode alone no longer implies it.
    db.store.messages.push(
      stalePendingProactive({
        proactive: false,
        railed: false,
        deliveryMode: "freeform",
        template: null,
      }),
    );
    const bird = new FakeBird();

    await resendStalePendingMessages({ db, bird, alert: async () => {} });

    expect(bird.sends).toHaveLength(1);
    expect(db.store.messages[0].status).toBe("sent");
  });
});
