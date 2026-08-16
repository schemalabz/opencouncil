import type { ExtractedMessageFields } from "@/lib/bird-extract";
import type { BirdLike } from "@/lib/bird";
import { STOP_ALREADY_TEXT, STOP_CONFIRMATION_TEXT } from "@/lib/stop";
import { type Row, makeFakeDb } from "../../../../../lib/__tests__/fake-db";
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

class FakeBird implements BirdLike {
  public sends: Array<{ conversationId: string; text: string; idempotencyKey: string }> = [];
  async sendText(input: { conversationId: string; text: string; idempotencyKey: string }) {
    this.sends.push(input);
    return { success: true, messageId: `bird-${this.sends.length}` };
  }
}

const SUB: Row = {
  id: "sub1",
  userId: "user1",
  phone: "+306900000001",
  status: "active",
  origin: "inbound",
  unsubscribedAt: null,
  birdConversationId: "conv-1",
  profileText: "x",
  cities: [],
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
