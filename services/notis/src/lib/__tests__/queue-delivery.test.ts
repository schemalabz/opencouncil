import {
  RESEND_STALE_AFTER_MS,
  SMS_HELD_FOR_QUIET_HOURS,
  deliverPendingMessage,
  resendStalePendingMessages,
} from "../queue";
import { PROACTIVE_PAUSED_KEY } from "../settings";
import { type Row, makeFakeDb } from "./fake-db";
import { FakeBird } from "./fake-bird";

/**
 * The delivery choke point and the sweeper. These cover the retry/release
 * paths, which the send boundary's own rails do not reach: a row that stays
 * pending (a transient Bird failure, or an SMS held for quiet hours) is
 * delivered later by the sweeper, and the reader may have unsubscribed or the
 * kill switch may have flipped in between.
 */

const SUB = {
  id: "sub1",
  phone: "+306900000001",
  userName: "Μαρία",
  birdConversationId: "conv-1",
};

function liveSettings(): Row[] {
  return [{ key: PROACTIVE_PAUSED_KEY, value: false }];
}

/** Seed one outbound row straight into the store — the state the sweeper or
 *  a retry finds, without running a whole wake to produce it. */
function seedMessage(db: ReturnType<typeof makeFakeDb>, row: Row): string {
  const id = (row.id as string) ?? "m1";
  db.store.messages.push({
    id,
    subscriptionId: "sub1",
    direction: "outbound",
    status: "pending",
    channel: "whatsapp",
    createdAt: new Date(),
    body: "κείμενο",
    ...row,
  });
  return id;
}

const noAlert = async () => {};

const DO_NOT_FAKE = [
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "setImmediate",
  "nextTick",
  "queueMicrotask",
] as const;

describe("deliverPendingMessage — rails on the retry path", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date("2026-08-18T09:00:00.000Z"), // 12:00 Athens — active hours
      doNotFake: [...DO_NOT_FAKE],
    });
  });
  afterEach(() => jest.useRealTimers());

  it("suppresses a reply-continuation template (proactive:false) when the reader unsubscribed", async () => {
    // A promised follow-up is cap-exempt, so proactive is false — but it is a
    // template send, so it is unprompted and must still respect a ΣΤΟΠ. The
    // rail keys on proactive OR template for exactly this row.
    const db = makeFakeDb({
      subscriptions: [{ ...SUB, status: "unsubscribed", unsubscribedAt: new Date() }],
      settings: liveSettings(),
    });
    const id = seedMessage(db, {
      proactive: false,
      deliveryMode: "template",
      template: "demos_followup",
    });
    const bird = new FakeBird();

    await deliverPendingMessage(db, bird, id, { ...SUB }, noAlert);

    expect(bird.templateSends).toHaveLength(0);
    const msg = db.store.messages.find((m) => m.id === id)!;
    expect(msg.status).toBe("suppressed");
    expect(msg.failureReason).toBe("unsubscribed");
  });

  it("suppresses an unprompted template send while the kill switch is paused", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB, status: "active" }],
      settings: [{ key: PROACTIVE_PAUSED_KEY, value: true }],
    });
    const id = seedMessage(db, {
      proactive: true,
      deliveryMode: "template",
      template: "demos_update_news",
    });
    const bird = new FakeBird();

    await deliverPendingMessage(db, bird, id, { ...SUB }, noAlert);

    expect(bird.templateSends).toHaveLength(0);
    expect(db.store.messages.find((m) => m.id === id)!.status).toBe("suppressed");
  });

  it("still delivers a reactive free-form reply to an unsubscribed reader — rails bypass preserved", async () => {
    // The one legitimate send to someone who just unsubscribed: the ΣΤΟΠ
    // confirmation and any in-flight reply are free-form, so they are not
    // railed. Guards against the rail change over-blocking.
    const db = makeFakeDb({
      subscriptions: [{ ...SUB, status: "unsubscribed", unsubscribedAt: new Date() }],
      settings: liveSettings(),
    });
    const id = seedMessage(db, { proactive: false, deliveryMode: "freeform" });
    const bird = new FakeBird();

    await deliverPendingMessage(db, bird, id, { ...SUB }, noAlert);

    expect(bird.sends).toHaveLength(1);
    expect(db.store.messages.find((m) => m.id === id)!.status).toBe("sent");
  });

  it("does not send a row another worker is still sending (claim fence)", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB, status: "active" }], settings: liveSettings() });
    const id = seedMessage(db, {
      proactive: true,
      deliveryMode: "template",
      template: "demos_update_news",
      sendingAt: new Date(), // a fresh claim held by another worker
    });
    const bird = new FakeBird();

    await deliverPendingMessage(db, bird, id, { ...SUB }, noAlert);

    expect(bird.templateSends).toHaveLength(0);
    expect(db.store.messages.find((m) => m.id === id)!.status).toBe("pending");
  });

  it("re-takes a stale claim and sends", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB, status: "active" }], settings: liveSettings() });
    const id = seedMessage(db, {
      proactive: true,
      deliveryMode: "template",
      template: "demos_update_news",
      sendingAt: new Date(Date.now() - 10 * 60_000), // claim well past its TTL
    });
    const bird = new FakeBird();

    await deliverPendingMessage(db, bird, id, { ...SUB }, noAlert);

    expect(bird.templateSends).toHaveLength(1);
    expect(db.store.messages.find((m) => m.id === id)!.status).toBe("sent");
  });
});

describe("resendStalePendingMessages — held SMS release honors the rails", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date("2026-08-18T09:00:00.000Z"), // 12:00 Athens — past the 09:00 release, not quiet
      doNotFake: [...DO_NOT_FAKE],
    });
  });
  afterEach(() => jest.useRealTimers());

  function heldSms(db: ReturnType<typeof makeFakeDb>) {
    return seedMessage(db, {
      id: "sms1",
      channel: "sms",
      proactive: true,
      failureReason: SMS_HELD_FOR_QUIET_HOURS,
      createdAt: new Date(Date.now() - RESEND_STALE_AFTER_MS - 60_000),
    });
  }

  it("suppresses a held SMS when the reader unsubscribed overnight", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB, status: "unsubscribed", unsubscribedAt: new Date() }],
      settings: liveSettings(),
    });
    const id = heldSms(db);
    const bird = new FakeBird();

    await resendStalePendingMessages({ db, bird, alert: noAlert });

    expect(bird.smsSends).toHaveLength(0);
    expect(db.store.messages.find((m) => m.id === id)!.status).toBe("suppressed");
  });

  it("releases a held SMS when the reader is still subscribed", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB, status: "active" }], settings: liveSettings() });
    const id = heldSms(db);
    const bird = new FakeBird();

    await resendStalePendingMessages({ db, bird, alert: noAlert });

    expect(bird.smsSends).toHaveLength(1);
    expect(db.store.messages.find((m) => m.id === id)!.status).toBe("sent");
  });
});
