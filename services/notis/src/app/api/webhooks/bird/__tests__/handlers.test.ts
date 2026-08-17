import type { ExtractedMessageFields } from "@/lib/bird-extract";
import { STOP_ALREADY_TEXT, STOP_CONFIRMATION_TEXT } from "@/lib/stop";
import { type Row, makeFakeDb } from "../../../../../lib/__tests__/fake-db";
import { FakeBird } from "../../../../../lib/__tests__/fake-bird";
import { handleInbound, handleOutboundStatus, isForwardProgression } from "../handlers";

// Enrollment reads the main-DB views through these two modules; the fakes
// are swapped per test via the mocked module.
jest.mock("@/lib/main-db", () => ({
  hasMainDb: jest.fn(() => false),
  mainDb: jest.fn(),
}));
jest.mock("@/lib/fanout", () => ({
  findEnabledUserByPhone: jest.fn(async () => null),
  citiesForUser: jest.fn(async () => []),
}));

import { hasMainDb, mainDb } from "@/lib/main-db";
import { citiesForUser, findEnabledUserByPhone } from "@/lib/fanout";


const SUB: Row = {
  id: "sub1",
  userId: "user1",
  phone: "+306900000001",
  status: "active",
  origin: "inbound",
  unsubscribedAt: null,
  birdConversationId: "conv-1",
  profileText: "x",
  userName: "Μαρία",
};

function inbound(overrides: Partial<ExtractedMessageFields> = {}): ExtractedMessageFields {
  return {
    birdMessageId: "bm-1",
    conversationId: "conv-1",
    direction: "inbound",
    phone: "+306900000001",
    body: "Τι ψηφίστηκε χθες;",
    channel: "whatsapp",
    status: "sent",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (hasMainDb as jest.Mock).mockReturnValue(false);
  (findEnabledUserByPhone as jest.Mock).mockResolvedValue(null);
  (citiesForUser as jest.Mock).mockResolvedValue([]);
  // When a test flips hasMainDb on, the gate sees an enabled user by default.
  (mainDb as jest.Mock).mockReturnValue({
    notisUserRow: { findUnique: jest.fn(async () => ({ notisEnabledAt: new Date() })) },
  });
});

describe("handleInbound", () => {
  it("persists the message and enqueues a live wake for a subscribed phone", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    const bird = new FakeBird();

    const result = await handleInbound(inbound(), { db, bird, alert: async () => {} });

    expect(result.action).toBe("enqueued");
    expect(db.store.messages).toHaveLength(1);
    expect(db.store.messages[0]).toMatchObject({
      direction: "inbound",
      body: "Τι ψηφίστηκε χθες;",
      birdMessageId: "bm-1",
    });
    const items = [...db.store.queue.values()];
    expect(items).toHaveLength(1);
    expect(items[0].lane).toBe("live");
    expect(items[0].events).toEqual([
      expect.objectContaining({ type: "user_message", text: "Τι ψηφίστηκε χθες;" }),
    ]);
    expect(bird.sends).toHaveLength(0);
  });

  it("stays silent for a phone notis does not serve — the main app answers those", async () => {
    const db = makeFakeDb();
    const bird = new FakeBird();

    const result = await handleInbound(inbound({ phone: "+306999999999" }), {
      db,
      bird,
      alert: async () => {},
    });

    expect(result).toEqual({ action: "ignored", reason: "not a notis-served phone" });
    expect(db.store.messages).toHaveLength(0);
    expect(db.store.subscriptions.size).toBe(0);
    expect(bird.sends).toHaveLength(0);
  });

  it("enrolls a rollout-enabled user on first contact, profile seeded from preferences", async () => {
    (hasMainDb as jest.Mock).mockReturnValue(true);
    (findEnabledUserByPhone as jest.Mock).mockResolvedValue({ id: "user9", name: "Νίκος" });
    (citiesForUser as jest.Mock).mockResolvedValue([
      { cityId: "athens", cityName: "Αθήνα", topics: ["Πολεοδομία"], locations: ["Κυψέλη"] },
    ]);
    const db = makeFakeDb();

    const result = await handleInbound(inbound({ phone: "306999999999" }), {
      db,
      bird: new FakeBird(),
      alert: async () => {},
    });

    expect(result.action).toBe("enqueued");
    const sub = [...db.store.subscriptions.values()][0];
    expect(sub).toMatchObject({
      userId: "user9",
      origin: "inbound",
      status: "active",
      phone: "+306999999999",
      birdConversationId: "conv-1",
      userName: "Νίκος",
    });
    expect(String(sub.profileText)).toContain("Αθήνα");
  });

  it("a bare ΣΤΟΠ unsubscribes deterministically — no wake, confirmation sent", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    const bird = new FakeBird();

    const result = await handleInbound(inbound({ body: " ΣΤΟΠ! " }), {
      db,
      bird,
      alert: async () => {},
    });

    expect(result).toEqual({ action: "stopped" });
    expect(db.store.queue.size).toBe(0);
    const sub = db.store.subscriptions.get("sub1")!;
    expect(sub.status).toBe("unsubscribed");
    expect(sub.unsubscribedAt).toBeInstanceOf(Date);
    expect(db.store.journal).toHaveLength(1);
    expect(bird.sends).toHaveLength(1);
    expect(bird.sends[0].text).toBe(STOP_CONFIRMATION_TEXT);
    const reply = db.store.messages.find((m) => m.direction === "outbound")!;
    expect(reply.status).toBe("sent");
    expect(bird.sends[0].idempotencyKey).toBe(reply.id);
  });

  it("a repeated ΣΤΟΠ gets the already-unsubscribed reminder without touching state", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB, status: "unsubscribed", unsubscribedAt: new Date("2026-08-01") }],
    });
    const bird = new FakeBird();

    const result = await handleInbound(inbound({ body: "stop" }), {
      db,
      bird,
      alert: async () => {},
    });

    expect(result).toEqual({ action: "stopped" });
    const sub = db.store.subscriptions.get("sub1")!;
    expect(sub.unsubscribedAt).toEqual(new Date("2026-08-01"));
    expect(bird.sends[0].text).toBe(STOP_ALREADY_TEXT);
  });

  it("a normal message from an unsubscribed subscription still wakes the agent", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB, status: "unsubscribed", unsubscribedAt: new Date("2026-08-01") }],
    });

    const result = await handleInbound(inbound(), {
      db,
      bird: new FakeBird(),
      alert: async () => {},
    });

    expect(result.action).toBe("enqueued");
  });

  it("ignores a replayed birdMessageId", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    await db.notisMessage.create({
      data: { subscriptionId: "sub1", direction: "inbound", body: "x", birdMessageId: "bm-1" },
    });

    const result = await handleInbound(inbound(), {
      db,
      bird: new FakeBird(),
      alert: async () => {},
    });

    expect(result).toEqual({ action: "ignored", reason: "duplicate birdMessageId" });
    expect(db.store.queue.size).toBe(0);
  });

  it("ignores an existing subscription whose user was rolled back (flag cleared)", async () => {
    (hasMainDb as jest.Mock).mockReturnValue(true);
    (mainDb as jest.Mock).mockReturnValue({
      notisUserRow: { findUnique: jest.fn(async () => ({ notisEnabledAt: null })) },
    });
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    const bird = new FakeBird();

    const result = await handleInbound(inbound(), { db, bird, alert: async () => {} });

    // The main app's webhook serves them again — answering here too would
    // double-reply.
    expect(result).toEqual({ action: "ignored", reason: "user rolled back to the old path" });
    expect(db.store.messages).toHaveLength(0);
    expect(db.store.queue.size).toBe(0);
    expect(bird.sends).toHaveLength(0);
  });

  it("re-enrolls by userId when the phone changed — the message is served, not dropped", async () => {
    (hasMainDb as jest.Mock).mockReturnValue(true);
    (findEnabledUserByPhone as jest.Mock).mockResolvedValue({ id: "user1", name: "Μαρία" });
    const db = makeFakeDb({ subscriptions: [{ ...SUB, phone: "+306900000001" }] });

    const result = await handleInbound(inbound({ phone: "+306999999999", conversationId: "conv-9" }), {
      db,
      bird: new FakeBird(),
      alert: async () => {},
    });

    expect(result.action).toBe("enqueued");
    // Same subscription, refreshed identity — no duplicate row, no P2002.
    expect(db.store.subscriptions.size).toBe(1);
    const sub = db.store.subscriptions.get("sub1")!;
    expect(sub.phone).toBe("+306999999999");
    expect(sub.birdConversationId).toBe("conv-9");
  });

  it("refreshes birdConversationId when Bird opens a new conversation for the phone", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });

    await handleInbound(inbound({ conversationId: "conv-2" }), {
      db,
      bird: new FakeBird(),
      alert: async () => {},
    });

    expect(db.store.subscriptions.get("sub1")?.birdConversationId).toBe("conv-2");
  });
});

describe("SMS fallback on failed proactive templates", () => {
  const LIVE = [{ key: "proactivePaused", value: false }];

  async function seedFailedCandidate(db: ReturnType<typeof makeFakeDb>, overrides: Row = {}) {
    await db.notisMessage.create({
      data: {
        subscriptionId: "sub1",
        direction: "outbound",
        body: "Νέα από τον δήμο.",
        birdMessageId: "bm-out",
        status: "sent",
        channel: "whatsapp",
        proactive: true,
        deliveryMode: "template",
        template: "demos_update_news",
        wakeId: "wake1",
        ...overrides,
      },
    });
  }

  const failedEvent = () =>
    inbound({ birdMessageId: "bm-out", direction: "outbound", status: "failed" });

  it("sends ONE SMS with the rendered shell when a live proactive template fails", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: LIVE });
    await seedFailedCandidate(db);
    const bird = new FakeBird();

    await handleOutboundStatus(failedEvent(), { db, bird });

    expect(bird.smsSends).toHaveLength(1);
    expect(bird.smsSends[0].phone).toBe("+306900000001");
    expect(bird.smsSends[0].text).toContain("Νέα από τον δήμο σου:");
    expect(bird.smsSends[0].text).toContain("Νέα από τον δήμο.");
    expect(bird.smsSends[0].text).toContain("ΣΤΟΠ");
    const sms = db.store.messages.find((m) => m.channel === "sms")!;
    expect(sms).toMatchObject({ status: "sent", fallbackForId: "msg_1", proactive: true });

    // A replayed failure webhook cannot fire a second SMS: the progression
    // guard stops it, and the unique fallbackForId backstops even a direct
    // re-entry.
    await handleOutboundStatus(failedEvent(), { db, bird });
    expect(bird.smsSends).toHaveLength(1);
    expect(db.store.messages.filter((m) => m.channel === "sms")).toHaveLength(1);
  });

  it("no fallback while paused (the default), for freeform sends, or for reactive messages", async () => {
    const cases: Array<{ settings?: Row[]; overrides: Row }> = [
      { settings: undefined, overrides: {} }, // paused (the default)
      { settings: LIVE, overrides: { deliveryMode: "freeform", template: null } },
      { settings: LIVE, overrides: { proactive: false } },
    ];
    for (const [i, c] of cases.entries()) {
      const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: c.settings });
      await seedFailedCandidate(db, { ...c.overrides, birdMessageId: `bm-${i}` });
      const bird = new FakeBird();
      await handleOutboundStatus(
        inbound({ birdMessageId: `bm-${i}`, direction: "outbound", status: "failed" }),
        { db, bird },
      );
      expect(bird.smsSends).toHaveLength(0);
    }
  });

  it("no fallback for an unsubscribed reader", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB, status: "unsubscribed", unsubscribedAt: new Date() }],
      settings: LIVE,
    });
    await seedFailedCandidate(db);
    const bird = new FakeBird();

    await handleOutboundStatus(failedEvent(), { db, bird });

    expect(bird.smsSends).toHaveLength(0);
  });

  it("an SMS send failure marks the row failed and alerts, and is never retried", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: LIVE });
    await seedFailedCandidate(db);
    const bird = new FakeBird({ success: false, error: "sms rejected" });
    const alerts: string[] = [];

    await handleOutboundStatus(failedEvent(), {
      db,
      bird,
      alert: async (m) => {
        alerts.push(m);
      },
    });

    const sms = db.store.messages.find((m) => m.channel === "sms")!;
    expect(sms.status).toBe("failed");
    expect(alerts.some((m) => m.includes("SMS fallback failed"))).toBe(true);
  });
});

describe("handleOutboundStatus", () => {
  it("progresses a notis outbound message forward only", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    await db.notisMessage.create({
      data: {
        subscriptionId: "sub1",
        direction: "outbound",
        body: "x",
        birdMessageId: "bm-out",
        status: "sent",
      },
    });

    const up = await handleOutboundStatus(
      inbound({ birdMessageId: "bm-out", direction: "outbound", status: "delivered" }),
      { db, bird: new FakeBird() },
    );
    expect(up).toEqual({ action: "status-updated" });
    expect(db.store.messages[0].status).toBe("delivered");

    const regress = await handleOutboundStatus(
      inbound({ birdMessageId: "bm-out", direction: "outbound", status: "sent" }),
      { db, bird: new FakeBird() },
    );
    expect(regress.action).toBe("ignored");
    expect(db.store.messages[0].status).toBe("delivered");
  });

  it("ignores unknown birdMessageIds — those are the main app's sends", async () => {
    const db = makeFakeDb();
    const result = await handleOutboundStatus(
      inbound({ birdMessageId: "someone-elses", direction: "outbound", status: "delivered" }),
      { db, bird: new FakeBird() },
    );
    expect(result.action).toBe("ignored");
  });
});

describe("isForwardProgression", () => {
  it("orders pending → sent → delivered → read and absorbs terminal states", () => {
    expect(isForwardProgression("pending", "sent")).toBe(true);
    expect(isForwardProgression("sent", "read")).toBe(true);
    expect(isForwardProgression("delivered", "read")).toBe(true);
    expect(isForwardProgression("read", "delivered")).toBe(false);
    expect(isForwardProgression("failed", "sent")).toBe(false);
    expect(isForwardProgression("delivered", "sent")).toBe(false);
  });

  it("a stale failure replay cannot regress a delivered message", () => {
    expect(isForwardProgression("delivered", "failed")).toBe(false);
    // ...but a genuine failure before delivery still lands.
    expect(isForwardProgression("sent", "failed")).toBe(true);
    expect(isForwardProgression("pending", "failed")).toBe(true);
  });
});

describe("a phone the reader no longer has", () => {
  it("stays silent, so the sender is not answered twice", async () => {
    // The main app's gate looks up User.phone and misses, so it sends its
    // unsupported-number reply. If notis answered as well — it still matches
    // its own stored phone — the sender would get two contradictory replies,
    // on every message.
    (hasMainDb as jest.Mock).mockReturnValue(true);
    (mainDb as jest.Mock).mockReturnValue({
      notisUserRow: {
        findUnique: async () => ({
          notisEnabledAt: new Date("2026-08-01"),
          phone: "+306999999999",
        }),
      },
    });
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    const bird = new FakeBird();

    const result = await handleInbound(inbound({ phone: SUB.phone as string }), {
      db,
      bird,
      alert: async () => {},
    });

    expect(result.action).toBe("ignored");
    expect(bird.sends).toHaveLength(0);
    expect(db.store.wakes).toHaveLength(0);
  });

  it("canonicalizes a stored number that differs only by the leading +", async () => {
    (hasMainDb as jest.Mock).mockReturnValue(true);
    (mainDb as jest.Mock).mockReturnValue({
      notisUserRow: {
        findUnique: async () => ({
          notisEnabledAt: new Date("2026-08-01"),
          phone: "+306900000001",
        }),
      },
    });
    // The lookup accepts both forms, so this subscription is found — and the
    // stored value is what later sends address.
    const db = makeFakeDb({ subscriptions: [{ ...SUB, phone: "306900000001" }] });

    await handleInbound(inbound({ phone: "+306900000001" }), {
      db,
      bird: new FakeBird(),
      alert: async () => {},
    });

    expect([...db.store.subscriptions.values()][0].phone).toBe("+306900000001");
  });
});

describe("isForwardProgression — delivery is monotonic", () => {
  it("delivered stays delivered when a late failure event arrives", () => {
    // Bird redelivers events, and a retry of an earlier attempt can report a
    // failure after the handset already received the message. Rewriting that
    // into `failed` would make the panel — and any audit of "did it arrive?"
    // — lie about a delivered message.
    expect(isForwardProgression("delivered", "failed")).toBe(false);
    expect(isForwardProgression("read", "failed")).toBe(false);
  });

  it("still lets a sent message turn out to have failed", () => {
    expect(isForwardProgression("sent", "failed")).toBe(true);
    expect(isForwardProgression("pending", "failed")).toBe(true);
  });

  it("keeps the happy path moving forward only", () => {
    expect(isForwardProgression("sent", "delivered")).toBe(true);
    expect(isForwardProgression("delivered", "read")).toBe(true);
    expect(isForwardProgression("read", "delivered")).toBe(false);
  });
});

