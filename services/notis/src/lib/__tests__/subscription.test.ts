import {
  markUnsubscribed,
  reactivateSubscription,
  recordSystemDecision,
} from "../subscription";
import { type Row, makeFakeDb } from "./fake-db";

/**
 * The shared state transitions against the fake store. The three existing
 * unsubscribe sites and the subscriptions API all run these inside their own
 * transactions; what is asserted here is the cleanup contract itself.
 */

const AT = new Date("2026-09-06T10:00:00.000Z");

const activeSub = (overrides: Row = {}): Row => ({
  id: "sub1",
  userId: "user1",
  phone: "+306900000001",
  status: "active",
  origin: "signup",
  unsubscribedAt: null,
  birdConversationId: "conv-1",
  profileText: "x",
  userName: "Μαρία",
  ...overrides,
});

describe("markUnsubscribed", () => {
  it("flips the row, suppresses pending outbound except the goodbye, and resolves open promises", async () => {
    const db = makeFakeDb({ subscriptions: [activeSub()] });
    db.store.messages.push(
      { id: "m-pending", subscriptionId: "sub1", direction: "outbound", status: "pending" },
      { id: "m-goodbye", subscriptionId: "sub1", direction: "outbound", status: "pending" },
      { id: "m-sent", subscriptionId: "sub1", direction: "outbound", status: "sent" },
      { id: "m-in", subscriptionId: "sub1", direction: "inbound", status: null },
      { id: "m-other", subscriptionId: "sub2", direction: "outbound", status: "pending" },
    );
    db.store.commitments.push(
      { id: "c-open", subscriptionId: "sub1", slug: "a", createdAt: AT, resolvedAt: null },
      { id: "c-done", subscriptionId: "sub1", slug: "b", createdAt: AT, resolvedAt: new Date(0) },
      { id: "c-other", subscriptionId: "sub2", slug: "a", createdAt: AT, resolvedAt: null },
    );

    await markUnsubscribed(db, { id: "sub1", status: "active" }, {
      at: AT,
      exceptMessageIds: ["m-goodbye"],
    });

    const sub = db.store.subscriptions.get("sub1")!;
    expect(sub).toMatchObject({ status: "unsubscribed", unsubscribedAt: AT, updatedAt: AT });
    expect(sub.phone).toBe("+306900000001");
    const byId = new Map(db.store.messages.map((m) => [m.id, m]));
    expect(byId.get("m-pending")).toMatchObject({ status: "suppressed", failureReason: "unsubscribed" });
    expect(byId.get("m-goodbye")!.status).toBe("pending");
    expect(byId.get("m-sent")!.status).toBe("sent");
    expect(byId.get("m-in")!.status).toBeNull();
    expect(byId.get("m-other")!.status).toBe("pending");
    const commitments = new Map(db.store.commitments.map((c) => [c.id, c]));
    expect(commitments.get("c-open")!.resolvedAt).toEqual(AT);
    expect(commitments.get("c-done")!.resolvedAt).toEqual(new Date(0));
    expect(commitments.get("c-other")!.resolvedAt).toBeNull();
  });

  it("keeps the original opt-out date for a reader who was already unsubscribed, and still cleans up", async () => {
    const earlier = new Date("2026-08-01T00:00:00.000Z");
    const db = makeFakeDb({
      subscriptions: [activeSub({ status: "unsubscribed", unsubscribedAt: earlier })],
    });
    db.store.messages.push({
      id: "m-pending",
      subscriptionId: "sub1",
      direction: "outbound",
      status: "pending",
    });

    await markUnsubscribed(db, { id: "sub1", status: "unsubscribed" }, { at: AT });

    expect(db.store.subscriptions.get("sub1")).toMatchObject({
      status: "unsubscribed",
      unsubscribedAt: earlier,
      updatedAt: AT,
    });
    expect(db.store.messages[0].status).toBe("suppressed");
  });

  it("clears the phone when asked — the phone-gone case", async () => {
    const db = makeFakeDb({ subscriptions: [activeSub()] });

    await markUnsubscribed(db, { id: "sub1", status: "active" }, { at: AT, clearPhone: true });

    expect(db.store.subscriptions.get("sub1")!.phone).toBeNull();
  });
});

describe("reactivateSubscription", () => {
  it("returns the row to active with the current phone and name, keeping the thread when the number is the same", async () => {
    const db = makeFakeDb({
      subscriptions: [activeSub({ status: "unsubscribed", unsubscribedAt: new Date(0) })],
    });

    await reactivateSubscription(db, { id: "sub1", phone: "+306900000001" }, {
      phone: "+306900000001",
      userName: "Μαρία Π.",
      at: AT,
    });

    expect(db.store.subscriptions.get("sub1")).toMatchObject({
      status: "active",
      unsubscribedAt: null,
      phone: "+306900000001",
      userName: "Μαρία Π.",
      birdConversationId: "conv-1",
      updatedAt: AT,
    });
  });

  it("drops the Bird conversation when the number changed, and the stale batch work either way", async () => {
    const db = makeFakeDb({
      subscriptions: [activeSub({ status: "unsubscribed", unsubscribedAt: new Date(0) })],
    });
    db.store.queue.set("q-batch", {
      id: "q-batch",
      subscriptionId: "sub1",
      lane: "batch",
      status: "pending",
      events: [],
    });
    db.store.queue.set("q-live", {
      id: "q-live",
      subscriptionId: "sub1",
      lane: "live",
      status: "pending",
      events: [],
    });
    db.store.queue.set("q-done", {
      id: "q-done",
      subscriptionId: "sub1",
      lane: "batch",
      status: "done",
      events: [],
    });
    db.store.queue.set("q-other", {
      id: "q-other",
      subscriptionId: "sub2",
      lane: "batch",
      status: "pending",
      events: [],
    });

    await reactivateSubscription(db, { id: "sub1", phone: "+306900000001" }, {
      phone: "+306911111111",
      at: AT,
    });

    expect(db.store.subscriptions.get("sub1")).toMatchObject({
      status: "active",
      phone: "+306911111111",
      birdConversationId: null,
    });
    expect([...db.store.queue.keys()].sort()).toEqual(["q-done", "q-live", "q-other"]);
  });
});

describe("recordSystemDecision", () => {
  it("writes a model-less silence wake carrying the rationale and the unsubscribe reason", async () => {
    const db = makeFakeDb({ subscriptions: [activeSub()] });

    await recordSystemDecision(db, "sub1", AT, {
      rationale: "(σύστημα) δοκιμή",
      unsubscribe: { reason: "profile" },
    });

    expect(db.store.wakes).toHaveLength(1);
    expect(db.store.wakes[0]).toMatchObject({
      subscriptionId: "sub1",
      eventType: "system",
      eventAt: AT,
      decision: "silence",
      rationale: "(σύστημα) δοκιμή",
      costUsd: 0,
    });
    expect(db.store.wakes[0].outcome).toMatchObject({ unsubscribe: { reason: "profile" } });
    expect(db.store.wakes[0]).not.toHaveProperty("model");
  });
});
