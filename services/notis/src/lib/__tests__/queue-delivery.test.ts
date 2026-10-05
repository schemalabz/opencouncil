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
    // A promised follow-up is cap-exempt, so proactive is false — but it is
    // unprompted at delivery, so it is stamped railed and must still respect
    // a ΣΤΟΠ. The rail keys on the stamp, not on mode inference.
    const db = makeFakeDb({
      subscriptions: [{ ...SUB, status: "unsubscribed", unsubscribedAt: new Date() }],
      settings: liveSettings(),
    });
    const id = seedMessage(db, {
      proactive: false,
      railed: true,
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
      railed: true,
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
      railed: true,
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

describe("SMS fallback for a number without WhatsApp", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date("2026-08-18T09:00:00.000Z"), // 12:00 Athens — active hours
      doNotFake: [...DO_NOT_FAKE],
    });
  });
  afterEach(() => jest.useRealTimers());

  const UNDELIVERABLE =
    "facebook: (code: 131026; title: Message undeliverable, details: Message Undeliverable.)";

  /** WhatsApp refuses the number; SMS still works. */
  class NoWhatsAppBird extends FakeBird {
    constructor(private readonly error: string) {
      super();
    }
    async sendTemplate(input: Parameters<FakeBird["sendTemplate"]>[0]) {
      this.templateSends.push(input);
      return { success: false as const, retryable: false, error: this.error };
    }
  }

  function seedTwoCardWake(db: ReturnType<typeof makeFakeDb>) {
    const earlier = new Date("2026-08-18T08:59:58.000Z");
    seedMessage(db, {
      id: "m1",
      wakeId: "w1",
      status: "sent",
      birdMessageId: "bird-m1",
      deliveryMode: "template",
      template: "demos_update_news",
      proactive: true,
      railed: true,
      body: "Η πλατεία Κυψέλης παίρνει 2,3 εκατ. για ανάπλαση.",
      createdAt: earlier,
    });
    seedMessage(db, {
      id: "m2",
      wakeId: "w1",
      status: "pending",
      deliveryMode: "template",
      template: "demos_update_news",
      proactive: true,
      railed: true,
      body: "Τα έργα ξεκινούν τον Σεπτέμβρη. https://opencouncil.gr/athens/m1",
      createdAt: new Date("2026-08-18T08:59:59.000Z"),
    });
  }

  it("folds the wake's earlier «sent» cards into the one SMS and closes them", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB, status: "active" }], settings: liveSettings() });
    seedTwoCardWake(db);
    const bird = new NoWhatsAppBird(UNDELIVERABLE);

    const outcome = await deliverPendingMessage(db, bird, "m2", { ...SUB }, noAlert);

    expect(outcome?.status).toBe("failed");
    expect(outcome?.smsFallback).toBe("sent");
    expect(bird.smsSends).toHaveLength(1);
    const sms = bird.smsSends[0].text;
    expect(sms.indexOf("Η πλατεία Κυψέλης")).toBeGreaterThan(-1);
    expect(sms.indexOf("Η πλατεία Κυψέλης")).toBeLessThan(sms.indexOf("Τα έργα ξεκινούν"));
    // One shell around the whole story, not one per card.
    expect(sms.split("Νέα από τον δήμο σου:").length - 1).toBe(1);
    const m1 = db.store.messages.find((m) => m.id === "m1")!;
    expect(m1.status).toBe("failed");
    expect(String(m1.failureReason)).toContain("folded into SMS");
    expect(db.store.messages.filter((m) => m.channel === "sms")).toHaveLength(1);
  });

  it("any other failure falls back with the failed card alone", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB, status: "active" }], settings: liveSettings() });
    seedTwoCardWake(db);
    const bird = new NoWhatsAppBird(
      "Unable to send WhatsApp message: facebook: (code: 132018, message: Param text cannot have new-line characters)",
    );

    await deliverPendingMessage(db, bird, "m2", { ...SUB }, noAlert);

    expect(bird.smsSends).toHaveLength(1);
    expect(bird.smsSends[0].text).not.toContain("Η πλατεία Κυψέλης");
    expect(db.store.messages.find((m) => m.id === "m1")!.status).toBe("sent");
  });

  it("a single-card fallback never closes another card that happens to carry the same text", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB, status: "active" }], settings: liveSettings() });
    seedTwoCardWake(db);
    // The earlier card repeats the failed card's text word for word.
    db.store.messages.find((m) => m.id === "m1")!.body =
      "Τα έργα ξεκινούν τον Σεπτέμβρη. https://opencouncil.gr/athens/m1";
    const bird = new NoWhatsAppBird(
      "Unable to send WhatsApp message: facebook: (code: 132018, message: Param text cannot have new-line characters)",
    );

    await deliverPendingMessage(db, bird, "m2", { ...SUB }, noAlert);

    expect(bird.smsSends).toHaveLength(1);
    expect(db.store.messages.find((m) => m.id === "m1")!.status).toBe("sent");
  });
});

describe("SMS fallback fold — limits", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date("2026-08-18T09:00:00.000Z"),
      doNotFake: [...DO_NOT_FAKE],
    });
  });
  afterEach(() => jest.useRealTimers());

  const UNDELIVERABLE =
    "facebook: (code: 131026; title: Message undeliverable, details: Message Undeliverable.)";

  class NoWhatsAppBird extends FakeBird {
    constructor(private readonly smsOk = true) {
      super();
    }
    async sendTemplate(input: Parameters<FakeBird["sendTemplate"]>[0]) {
      this.templateSends.push(input);
      return { success: false as const, retryable: false, error: UNDELIVERABLE };
    }
    async sendSms(input: { phone: string; text: string }) {
      this.smsSends.push(input);
      return this.smsOk
        ? { success: true as const, messageId: "sms-1" }
        : { success: false as const, retryable: false, error: "sms gateway down" };
    }
  }

  function seedCards(db: ReturnType<typeof makeFakeDb>, firstBody: string) {
    seedMessage(db, {
      id: "m1",
      wakeId: "w1",
      status: "sent",
      deliveryMode: "template",
      template: "demos_update_news",
      proactive: true,
      railed: true,
      body: firstBody,
      createdAt: new Date("2026-08-18T08:59:58.000Z"),
    });
    seedMessage(db, {
      id: "m2",
      wakeId: "w1",
      status: "pending",
      deliveryMode: "template",
      template: "demos_update_news",
      proactive: true,
      railed: true,
      body: "Τα έργα ξεκινούν τον Σεπτέμβρη.",
      createdAt: new Date("2026-08-18T08:59:59.000Z"),
    });
  }

  it("leaves a card out when the fold would run past SMS_FOLD_MAX_CHARS", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB, status: "active" }], settings: liveSettings() });
    seedCards(db, "Μακρύ κείμενο. ".repeat(80)); // ~1,200 chars
    const bird = new NoWhatsAppBird();

    await deliverPendingMessage(db, bird, "m2", { ...SUB }, noAlert);

    expect(bird.smsSends).toHaveLength(1);
    expect(bird.smsSends[0].text).not.toContain("Μακρύ κείμενο");
    expect(bird.smsSends[0].text).toContain("Τα έργα ξεκινούν");
    expect(db.store.messages.find((m) => m.id === "m1")!.status).toBe("sent");
  });

  it("does not close the folded cards when the SMS itself fails", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB, status: "active" }], settings: liveSettings() });
    seedCards(db, "Η πλατεία Κυψέλης παίρνει 2,3 εκατ.");
    const bird = new NoWhatsAppBird(false);

    const outcome = await deliverPendingMessage(db, bird, "m2", { ...SUB }, noAlert);

    expect(outcome?.smsFallback).toBe("failed");
    expect(bird.smsSends[0].text).toContain("Η πλατεία Κυψέλης");
    expect(db.store.messages.find((m) => m.id === "m1")!.status).toBe("sent");
  });
});

describe("SMS fallback fold — quiet-hours release", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date("2026-08-18T09:00:00.000Z"), // 12:00 Athens — past the release
      doNotFake: [...DO_NOT_FAKE],
    });
  });
  afterEach(() => jest.useRealTimers());

  it("closes the folded cards when a held SMS is released, not before", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB, status: "active" }], settings: liveSettings() });
    const first = "Η πλατεία Κυψέλης παίρνει 2,3 εκατ. για ανάπλαση.";
    const last = "Τα έργα ξεκινούν τον Σεπτέμβρη.";
    seedMessage(db, {
      id: "m1",
      wakeId: "w1",
      status: "sent",
      deliveryMode: "template",
      template: "demos_update_news",
      railed: true,
      body: first,
    });
    seedMessage(db, {
      id: "m2",
      wakeId: "w1",
      status: "failed",
      failureReason: "facebook: (code: 131026; title: Message undeliverable)",
      deliveryMode: "template",
      template: "demos_update_news",
      railed: true,
      body: last,
    });
    // The fold, held overnight: one SMS row carrying both cards.
    seedMessage(db, {
      id: "sms1",
      wakeId: "w1",
      channel: "sms",
      railed: true,
      fallbackForId: "m2",
      body: `Νέα από τον δήμο σου:\n\n${first}\n\n${last}\n\nΠερισσότερα στο link.`,
      failureReason: SMS_HELD_FOR_QUIET_HOURS,
      createdAt: new Date(Date.now() - RESEND_STALE_AFTER_MS - 60_000),
    });
    const bird = new FakeBird();

    await resendStalePendingMessages({ db, bird, alert: noAlert });

    expect(bird.smsSends).toHaveLength(1);
    expect(db.store.messages.find((m) => m.id === "sms1")!.status).toBe("sent");
    const m1 = db.store.messages.find((m) => m.id === "m1")!;
    expect(m1.status).toBe("failed");
    expect(String(m1.failureReason)).toContain("folded into SMS sms1");
  });
});
