import type { PrismaClient as MainViewsClient } from "../../../generated/main-client";
import { readSubscription, setSubscriptionStatus } from "../subscriptions-api";
import { type Row, makeFakeDb } from "./fake-db";

/**
 * The profile switch's contract against the fake store: what "off" cleans
 * up, what "on" needs from the main database, and what it refuses.
 */

const AT = new Date("2026-09-06T10:00:00.000Z");
const now = () => AT;

const sub = (overrides: Row = {}): Row => ({
  id: "sub1",
  userId: "user1",
  phone: "+306900000001",
  status: "active",
  origin: "signup",
  unsubscribedAt: null,
  birdConversationId: "conv-1",
  profileText: "x",
  userName: "Μαρία",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  ...overrides,
});

function fakeMain(user: Row | null): MainViewsClient {
  return {
    notisUserRow: { findUnique: async () => user },
  } as unknown as MainViewsClient;
}

describe("readSubscription", () => {
  it("returns null for a reader without one, and the view for a reader with one", async () => {
    const db = makeFakeDb({ subscriptions: [sub()] });
    expect(await readSubscription(db, "nobody")).toBeNull();
    expect(await readSubscription(db, "user1")).toEqual({
      status: "active",
      phone: "+306900000001",
      origin: "signup",
      unsubscribedAt: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    });
  });
});

describe("setSubscriptionStatus → unsubscribed", () => {
  it("flips an active reader, suppresses what was queued, and records why", async () => {
    const db = makeFakeDb({ subscriptions: [sub()] });
    db.store.messages.push({
      id: "m-pending",
      subscriptionId: "sub1",
      direction: "outbound",
      status: "pending",
    });

    const result = await setSubscriptionStatus(db, null, "user1", "unsubscribed", now);

    expect(result).toEqual({
      kind: "ok",
      subscription: expect.objectContaining({ status: "unsubscribed", unsubscribedAt: AT.toISOString() }),
    });
    expect(db.store.messages[0].status).toBe("suppressed");
    expect(db.store.wakes).toHaveLength(1);
    expect(db.store.wakes[0]).toMatchObject({ eventType: "system", decision: "silence" });
    expect(db.store.wakes[0].outcome).toMatchObject({ unsubscribe: { reason: "profile" } });
  });

  it("is a no-op for a reader who is already unsubscribed, and for one with no subscription", async () => {
    const earlier = new Date("2026-08-15T00:00:00.000Z");
    const db = makeFakeDb({
      subscriptions: [sub({ status: "unsubscribed", unsubscribedAt: earlier })],
    });

    const same = await setSubscriptionStatus(db, null, "user1", "unsubscribed", now);
    const none = await setSubscriptionStatus(db, null, "nobody", "unsubscribed", now);

    expect(same).toEqual({
      kind: "ok",
      subscription: expect.objectContaining({ unsubscribedAt: earlier.toISOString() }),
    });
    expect(none).toEqual({ kind: "ok", subscription: null });
    expect(db.store.wakes).toHaveLength(0);
  });
});

describe("setSubscriptionStatus → active", () => {
  it("leaves a reader with no subscription to the poller", async () => {
    const db = makeFakeDb();

    const result = await setSubscriptionStatus(db, fakeMain(null), "user1", "active", now);

    expect(result).toEqual({ kind: "ok", subscription: null, next: "poller" });
    expect(db.store.subscriptions.size).toBe(0);
  });

  it("reactivates with the number the main app holds now, repaired, and drops stale batch work", async () => {
    const db = makeFakeDb({
      subscriptions: [sub({ status: "unsubscribed", unsubscribedAt: new Date(0), phone: null })],
    });
    db.store.queue.set("q-old", {
      id: "q-old",
      subscriptionId: "sub1",
      lane: "batch",
      status: "pending",
      events: [],
    });
    // The bare-plus shape the old phone input let through.
    const main = fakeMain({ id: "user1", name: "Μαρία Π.", phone: "+6943472297" });

    const result = await setSubscriptionStatus(db, main, "user1", "active", now);

    expect(result).toEqual({
      kind: "ok",
      subscription: expect.objectContaining({
        status: "active",
        phone: "+306943472297",
        unsubscribedAt: null,
      }),
    });
    expect(db.store.subscriptions.get("sub1")).toMatchObject({
      userName: "Μαρία Π.",
      birdConversationId: null, // the number changed, so the thread is new
    });
    expect(db.store.queue.size).toBe(0);
    expect(db.store.wakes).toHaveLength(1);
    expect(db.store.wakes[0].outcome).not.toHaveProperty("unsubscribe");
    // Nothing was queued to send: reactivation is silent.
    expect(db.store.messages).toHaveLength(0);
  });

  it("is a no-op for a reader who is already active", async () => {
    const db = makeFakeDb({ subscriptions: [sub()] });

    const result = await setSubscriptionStatus(db, fakeMain(null), "user1", "active", now);

    expect(result).toEqual({ kind: "ok", subscription: expect.objectContaining({ status: "active" }) });
    expect(db.store.wakes).toHaveLength(0);
  });

  it("refuses when the main database, the reader, or a usable number is missing", async () => {
    const unsubscribed = () =>
      makeFakeDb({ subscriptions: [sub({ status: "unsubscribed", unsubscribedAt: new Date(0) })] });

    expect(await setSubscriptionStatus(unsubscribed(), null, "user1", "active", now)).toEqual({
      kind: "rejected",
      status: 503,
      code: "main_database_unavailable",
    });
    expect(await setSubscriptionStatus(unsubscribed(), fakeMain(null), "user1", "active", now)).toEqual({
      kind: "rejected",
      status: 404,
      code: "unknown_user",
    });
    expect(
      await setSubscriptionStatus(
        unsubscribed(),
        fakeMain({ id: "user1", name: "Μαρία", phone: null }),
        "user1",
        "active",
        now,
      ),
    ).toEqual({ kind: "rejected", status: 409, code: "phone_empty" });
    expect(
      await setSubscriptionStatus(
        unsubscribed(),
        fakeMain({ id: "user1", name: "Μαρία", phone: "+302106459454" }),
        "user1",
        "active",
        now,
      ),
    ).toEqual({ kind: "rejected", status: 409, code: "phone_not_mobile" });
  });

  it("refuses a number that another active reader already holds", async () => {
    const db = makeFakeDb({
      subscriptions: [
        sub({ status: "unsubscribed", unsubscribedAt: new Date(0) }),
        sub({ id: "sub2", userId: "user2", phone: "+306900000001" }),
      ],
    });

    const result = await setSubscriptionStatus(
      db,
      fakeMain({ id: "user1", name: "Μαρία", phone: "+306900000001" }),
      "user1",
      "active",
      now,
    );

    expect(result).toEqual({ kind: "rejected", status: 409, code: "phone_in_use" });
    expect(db.store.subscriptions.get("sub1")!.status).toBe("unsubscribed");
  });
});
