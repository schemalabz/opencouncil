import { FakeAnthropic, makeDeps, meetingEvent, toolUse } from "../../agent/__tests__/helpers";
import { WakeEvent } from "../../agent/types";
import type { NotisSubscription } from "../../../generated/client";
import { type ClaimedItem } from "../queue-core";
import { PROACTIVE_PAUSED_KEY } from "../settings";
import {
  UNSETTLED_DEFER_MS,
  WEEKLY_TEMPLATE_CAP,
  deliverPendingMessage,
  processItem,
} from "../queue";
import { type Row, makeFakeDb } from "./fake-db";
import { FakeBird } from "./fake-bird";

/**
 * The proactive send boundary: shadow, pause, the proactive limit,
 * unsubscribed — and the classes that bypass them (reactive, an open 24h
 * window).
 */

const SUB: Row = {
  id: "sub1",
  userId: "user1",
  phone: "+306900000001",
  status: "active",
  origin: "transition",
  unsubscribedAt: null,
  birdConversationId: "conv-1",
  profileText: "x",
  userName: "Μαρία",
};

/** Exactly the fields deliverPendingMessage reads, typed as it types them. */
const SUB_ARG: Pick<
  NotisSubscription,
  "id" | "phone" | "userName" | "birdConversationId"
> = {
  id: "sub1",
  phone: "+306900000001",
  userName: "Μαρία",
  birdConversationId: "conv-1",
};

const sendTurn = [
  {
    content: [
      toolUse("t1", "send_message", { text: "Νέα από τον δήμο σου." }),
      toolUse("t2", "finish_wake", { rationale: "Άξιζε." }),
    ],
    stop_reason: "tool_use",
  },
];

function batchItem(events: WakeEvent[]): ClaimedItem {
  return { id: "q1", subscriptionId: "sub1", lane: "batch", events, attempts: 1 };
}

function seedClaim(db: ReturnType<typeof makeFakeDb>, attempts = 1) {
  db.store.queue.set("q1", { id: "q1", status: "running", attempts });
}

/** One template send that reached the reader, `hoursAgo` ago, on its own wake
 *  — one occasion against the proactive limit. `bubbles` writes several rows
 *  under that one wake, which is the case the row-counting cap got wrong. */
function seedTemplateSend(
  db: ReturnType<typeof makeFakeDb>,
  key: string,
  hoursAgo: number,
  bubbles = 1,
) {
  const at = new Date(Date.now() - hoursAgo * 3_600_000);
  db.store.wakes.push({
    id: `wake-${key}`,
    subscriptionId: "sub1",
    eventType: "meeting_summarized",
    eventAt: at,
    decision: "send",
    rationale: "άξιζε",
    outcome: null,
    truncated: false,
    model: "claude-sonnet-5",
  });
  for (let b = 0; b < bubbles; b++) {
    db.store.messages.push({
      id: `${key}-${b}`,
      subscriptionId: "sub1",
      wakeId: `wake-${key}`,
      direction: "outbound",
      channel: "whatsapp",
      body: `παλιό μήνυμα ${key}-${b}`,
      proactive: true,
      railed: true,
      deliveryMode: "template",
      template: "demos_update_news",
      status: "sent",
      failureReason: null,
      createdAt: at,
    });
  }
}

/** Just over the 24h reply window, so one reply can answer exactly one push:
 *  a reply an hour after a send still lands before the next one, and 25h
 *  after it lands after the next one. */
const SEND_SPACING_H = 25;
const WEEK_H = 7 * 24;

/** `count` unreplied template sends, oldest first. Returns each one's age in
 *  hours so a test can place a reply relative to the send it answers.
 *
 *  Individually answerable sends have to be more than 24h apart, so at most
 *  six of them fit in the rolling week. Raise WEEKLY_TEMPLATE_CAP past that
 *  and this throws rather than seeding sends outside the window, where they
 *  would not be counted and every cap test would pass for the wrong reason. */
function seedTemplateSends(
  db: ReturnType<typeof makeFakeDb>,
  count: number,
  { bubbles = 1, prefix = "old" }: { bubbles?: number; prefix?: string } = {},
): number[] {
  if (count * SEND_SPACING_H >= WEEK_H) {
    throw new Error(
      `${count} sends spaced ${SEND_SPACING_H}h apart do not fit in the rolling ` +
        "week — the fixture, or the cap, needs rethinking",
    );
  }
  const ages: number[] = [];
  for (let i = 0; i < count; i++) {
    const hoursAgo = (count - i) * SEND_SPACING_H;
    seedTemplateSend(db, `${prefix}${i}`, hoursAgo, bubbles);
    ages.push(hoursAgo);
  }
  return ages;
}

function seedInbound(
  db: ReturnType<typeof makeFakeDb>,
  key: string,
  hoursAgo: number,
  channel: "whatsapp" | "sms" = "whatsapp",
) {
  db.store.messages.push({
    id: key,
    subscriptionId: "sub1",
    direction: "inbound",
    channel,
    body: "τι έγινε τελικά;",
    status: null,
    createdAt: new Date(Date.now() - hoursAgo * 3_600_000),
  });
}

function liveSettings(): Row[] {
  return [{ key: PROACTIVE_PAUSED_KEY, value: false }];
}

const DO_NOT_FAKE = [
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "setImmediate",
  "nextTick",
  "queueMicrotask",
] as const;

describe("proactive rails", () => {
  // The pre-model quiet check reads the wall clock; pin it to a mid-day
  // Athens instant so the suite never flakes near the 23:00 boundary.
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date("2026-08-18T09:00:00.000Z"), // 12:00 Athens
      doNotFake: [...DO_NOT_FAKE],
    });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("paused is the default (no settings rows): the item defers BEFORE the model runs", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }] });
    seedClaim(db);
    const anthropic = new FakeAnthropic(sendTurn);
    const bird = new FakeBird();

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird,
      deps: makeDeps(anthropic),
      alert: async () => {},
    });

    // A fresh deployment lands dark: no model spend, no sends, the item
    // sleeps with its attempt undone.
    expect(anthropic.requests).toHaveLength(0);
    expect(db.store.wakes).toHaveLength(0);
    expect(bird.templateSends).toHaveLength(0);
    const item = db.store.queue.get("q1")!;
    expect(item.status).toBe("pending");
    expect(item.attempts).toBe(0);
  });

  it("live: an out-of-window meeting wake rides its template into the existing conversation", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    const bird = new FakeBird();

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird,
      deps: makeDeps(new FakeAnthropic(sendTurn)),
      alert: async () => {},
    });

    expect(bird.templateSends).toEqual([
      expect.objectContaining({
        conversationId: "conv-1",
        template: "demos_update_news",
        text: "Νέα από τον δήμο σου.",
      }),
    ]);
    const outbound = db.store.messages.find((m) => m.direction === "outbound")!;
    expect(outbound.status).toBe("sent");
    expect(outbound.deliveryMode).toBe("template");
  });

  it("live cold send: no conversation yet — one is created and adopted", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB, birdConversationId: null }],
      settings: liveSettings(),
    });
    seedClaim(db);
    const bird = new FakeBird();

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird,
      deps: makeDeps(new FakeAnthropic(sendTurn)),
      alert: async () => {},
    });

    expect(bird.created).toHaveLength(1);
    expect(bird.created[0].phone).toBe("+306900000001");
    expect(db.store.subscriptions.get("sub1")?.birdConversationId).toBe("conv-new-1");
    const outbound = db.store.messages.find((m) => m.direction === "outbound")!;
    expect(outbound.status).toBe("sent");
  });

  it("a reply at 04:00 bypasses every rail — paused, quiet, cap", async () => {
    jest.useFakeTimers({
      now: new Date("2026-08-18T01:00:00.000Z"), // 04:00 Athens, deep quiet
      doNotFake: [...DO_NOT_FAKE],
    });
    try {
      const db = makeFakeDb({
        subscriptions: [{ ...SUB }],
        settings: [{ key: PROACTIVE_PAUSED_KEY, value: true }],
      });
      seedClaim(db);
      const bird = new FakeBird();

      await processItem(
        {
          id: "q1",
          subscriptionId: "sub1",
          lane: "live",
          events: [{ type: "user_message", at: new Date().toISOString(), text: "νέα;" }],
          attempts: 1,
        },
        { db, bird, deps: makeDeps(new FakeAnthropic(sendTurn)), alert: async () => {} },
      );

      expect(bird.sends).toHaveLength(1);
      const outbound = db.store.messages.find((m) => m.direction === "outbound")!;
      expect(outbound.status).toBe("sent");
      expect(outbound.proactive).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("proactive limit: a reader at the cap gets no further template, and no model run", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    seedTemplateSends(db, WEEKLY_TEMPLATE_CAP);
    const bird = new FakeBird();
    const anthropic = new FakeAnthropic(sendTurn);

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird,
      deps: makeDeps(anthropic),
      alert: async () => {},
    });

    expect(anthropic.requests).toHaveLength(0);
    expect(bird.templateSends).toHaveLength(0);
    expect(db.store.messages.some((m) => m.wakeId === "wake-new")).toBe(false);
    expect(db.store.queue.get("q1")?.status).toBe("done");
    // A model-less wake row says what went unexamined, so the next wake's
    // decision log is not left believing this reader was told.
    const skipped = db.store.wakes.at(-1)!;
    expect(skipped.decision).toBe("silence");
    expect(skipped.model ?? null).toBeNull();
    expect(String(skipped.rationale)).toContain("δεν εξετάστηκε");
  });

  it("one wake is one send against the limit, however many bubbles it wrote", async () => {
    // The rule the row-counting cap got wrong. One occasion short of the cap,
    // carrying far more ROWS than the whole week's budget, still leaves the
    // reader room for one more push.
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    seedTemplateSends(db, WEEKLY_TEMPLATE_CAP - 1, { bubbles: WEEKLY_TEMPLATE_CAP });
    const bird = new FakeBird();

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird,
      deps: makeDeps(new FakeAnthropic(sendTurn)),
      alert: async () => {},
    });

    expect(bird.templateSends).toHaveLength(1);
  });

  it("a reply within 24h clears the send that drew it — on either channel", async () => {
    for (const channel of ["whatsapp", "sms"] as const) {
      const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
      seedClaim(db);
      const ages = seedTemplateSends(db, WEEKLY_TEMPLATE_CAP);
      // Answers the oldest push and nothing else: it lands 1h after that send
      // and BEFORE every later one, so exactly one occasion is cleared.
      seedInbound(db, "reply", ages[0] - 1, channel);
      const bird = new FakeBird();

      await processItem(batchItem([meetingEvent()]), {
        db,
        bird,
        deps: makeDeps(new FakeAnthropic(sendTurn)),
        alert: async () => {},
      });

      expect(bird.templateSends).toHaveLength(1);
    }
  });

  it("a reply after the 24h window has closed does not clear anything", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    const ages = seedTemplateSends(db, WEEKLY_TEMPLATE_CAP);
    // 25 hours after the oldest push — one hour too late to answer it, and
    // still before every later one, so it clears none of them.
    seedInbound(db, "reply", ages[0] - 25);
    const bird = new FakeBird();
    const anthropic = new FakeAnthropic(sendTurn);

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird,
      deps: makeDeps(anthropic),
      alert: async () => {},
    });

    expect(anthropic.requests).toHaveLength(0);
    expect(bird.templateSends).toHaveLength(0);
  });

  it("a template that arrived as an SMS fallback counts once, not twice or never", async () => {
    // WhatsApp failed and the second leg carried it: the reader's handset
    // still buzzed, so the occasion counts. Both rows are ONE occasion, so
    // the pair must not spend two slots either.
    const seedFallbacks = (db: ReturnType<typeof makeFakeDb>, count: number) => {
      seedTemplateSends(db, count);
      for (let i = 0; i < count; i++) {
        const failed = db.store.messages.find((m) => m.id === `old${i}-0`)!;
        failed.status = "failed";
        failed.failureReason = "boom";
        db.store.messages.push({
          id: `sms${i}`,
          subscriptionId: "sub1",
          wakeId: `wake-old${i}`,
          fallbackForId: `old${i}-0`,
          direction: "outbound",
          channel: "sms",
          body: "το ίδιο κείμενο, με SMS",
          proactive: true,
          railed: true,
          status: "sent",
          failureReason: null,
          createdAt: failed.createdAt as Date,
        });
      }
    };

    // At the cap: counted at all, so the next push is stopped.
    const atCap = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(atCap);
    seedFallbacks(atCap, WEEKLY_TEMPLATE_CAP);
    const stopped = new FakeBird();
    const unusedModel = new FakeAnthropic(sendTurn);
    await processItem(batchItem([meetingEvent()]), {
      db: atCap,
      bird: stopped,
      deps: makeDeps(unusedModel),
      alert: async () => {},
    });
    expect(unusedModel.requests).toHaveLength(0);
    expect(stopped.templateSends).toHaveLength(0);

    // One short of it: twice as many ROWS as the whole budget, and still
    // under the cap — so the two legs are one occasion, not two.
    const underCap = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(underCap);
    seedFallbacks(underCap, WEEKLY_TEMPLATE_CAP - 1);
    const sending = new FakeBird();
    await processItem(batchItem([meetingEvent()]), {
      db: underCap,
      bird: sending,
      deps: makeDeps(new FakeAnthropic(sendTurn)),
      alert: async () => {},
    });
    expect(sending.templateSends).toHaveLength(1);
  });

  it("an open 24h window is never capped: a freeform push goes out at the limit", async () => {
    // The limit counts cold pushes. Inside the window the reader is talking
    // to us, so the send costs them nothing they did not invite.
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    seedTemplateSends(db, WEEKLY_TEMPLATE_CAP);
    // Two hours ago, and more than 24h after every push above — so it opens
    // the window without clearing a single occasion.
    seedInbound(db, "recent", 2);
    const bird = new FakeBird();

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird,
      deps: makeDeps(new FakeAnthropic(sendTurn)),
      alert: async () => {},
    });

    expect(bird.templateSends).toHaveLength(0);
    expect(bird.sends).toHaveLength(1);
  });

  it("the limit fills DURING the wake: the whole wake is suppressed, not part of it", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    const bird = new FakeBird();
    // Clear at claim time and full by the time the boundary runs — the race
    // the pre-model check cannot see, modelled by a client that fills the
    // budget as it answers.
    const twoBubbles = [
      {
        content: [
          toolUse("t1", "send_message", { text: "Πρώτο μήνυμα." }),
          toolUse("t2", "send_message", { text: "Δεύτερο μήνυμα." }),
          toolUse("t3", "finish_wake", { rationale: "Άξιζε." }),
        ],
        stop_reason: "tool_use",
      },
    ];
    const scripted = new FakeAnthropic(twoBubbles);
    const anthropic = {
      create: async (params: Parameters<typeof scripted.create>[0]) => {
        seedTemplateSends(db, WEEKLY_TEMPLATE_CAP, { prefix: "mid" });
        return scripted.create(params);
      },
    };

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird,
      deps: makeDeps(anthropic),
      alert: async () => {},
    });

    const outbound = db.store.messages.filter((m) => String(m.body).endsWith("μήνυμα."));
    expect(outbound).toHaveLength(2);
    // All-or-nothing: half a story on the handset is worse than none.
    for (const row of outbound) {
      expect(row.status).toBe("suppressed");
      expect(row.failureReason).toBe("proactive limit");
    }
    expect(bird.templateSends).toHaveLength(0);
  });

  it("a limit spent on sends still in flight defers the wake instead of dropping it", async () => {
    // Dropping is permanent: the events are consumed. A reader cannot ignore
    // a push that has not arrived, so the wake waits for those rows to
    // settle rather than dying on them.
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    seedTemplateSends(db, WEEKLY_TEMPLATE_CAP);
    // One is a transient Bird failure the sweeper is still retrying.
    db.store.messages.find((m) => m.id === "old0-0")!.status = "pending";
    const bird = new FakeBird();
    const anthropic = new FakeAnthropic(sendTurn);

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird,
      deps: makeDeps(anthropic),
      alert: async () => {},
    });

    expect(anthropic.requests).toHaveLength(0);
    expect(bird.templateSends).toHaveLength(0);
    const item = db.store.queue.get("q1")!;
    expect(item.status).toBe("pending");
    // deferItem undoes the attempt, so waiting is never a retry.
    expect(item.attempts).toBe(0);
    expect((item.runAfter as Date).getTime()).toBeGreaterThan(Date.now());
    expect((item.runAfter as Date).getTime()).toBeLessThanOrEqual(Date.now() + UNSETTLED_DEFER_MS);
    // Nothing was recorded as unexamined: the wake has not been decided yet.
    expect(db.store.wakes.every((w) => w.decision !== "silence")).toBe(true);
  });

  it("a limit spent on sends that arrived still drops the wake", async () => {
    // The other half of the rule: pending rows are the only reason to wait.
    // Once they are on the handset the budget is real and the wake is closed.
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    seedTemplateSends(db, WEEKLY_TEMPLATE_CAP);
    db.store.messages.find((m) => m.id === "old0-0")!.status = "pending";
    // One more that DID arrive, so the cap holds without the pending one.
    seedTemplateSend(db, "arrived", 5);
    const bird = new FakeBird();
    const anthropic = new FakeAnthropic(sendTurn);

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird,
      deps: makeDeps(anthropic),
      alert: async () => {},
    });

    expect(anthropic.requests).toHaveLength(0);
    expect(db.store.queue.get("q1")?.status).toBe("done");
    expect(String(db.store.wakes.at(-1)!.rationale)).toContain("δεν εξετάστηκε");
  });

  it("a send the limit held back reaches the next wake's prompt as NOT SENT", async () => {
    // The agent wrote that text for this reader and it never left. Hiding it
    // would have the next wake write the same news again, believing it was
    // never said.
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    db.store.messages.push({
      id: "held",
      subscriptionId: "sub1",
      direction: "outbound",
      status: "suppressed",
      failureReason: "proactive limit",
      body: "Η πλατεία παίρνει 2,3 εκατ.",
      createdAt: new Date(Date.now() - 60 * 60_000),
    });
    const silenceTurn = [
      { content: [toolUse("t1", "finish_wake", { rationale: "όχι τώρα" })], stop_reason: "tool_use" },
    ];
    const anthropic = new FakeAnthropic(silenceTurn);

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird: new FakeBird(),
      deps: makeDeps(anthropic),
      alert: async () => {},
    });

    const userTurn = (
      anthropic.requests[0].messages[0] as { content: Array<{ text: string }> }
    ).content[0].text;
    expect(userTurn).toContain("Η πλατεία παίρνει 2,3 εκατ.");
    expect(userTurn).toContain("NOT SENT (proactive limit");
  });

  it("the decision log the model sees comes from the wake rows", async () => {
    // A past wake's decision — including a model-less one like a cap skip —
    // reaches the next prompt from NotisWake itself; no separate journal.
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    db.store.wakes.push({
      id: "w-old",
      subscriptionId: "sub1",
      eventType: "meeting_summarized",
      eventAt: new Date(Date.now() - 24 * 3_600_000),
      decision: "silence",
      rationale: "τίποτα κοντά τους αυτή τη φορά",
      outcome: { decision: "silence", rationale: "τίποτα κοντά τους αυτή τη φορά", messages: [], scheduledWakes: [] },
      truncated: false,
      model: null,
      createdAt: new Date(Date.now() - 24 * 3_600_000),
    });
    const silenceTurn = [
      { content: [toolUse("t1", "finish_wake", { rationale: "όχι" })], stop_reason: "tool_use" },
    ];
    const anthropic = new FakeAnthropic(silenceTurn);

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird: new FakeBird(),
      deps: makeDeps(anthropic),
      alert: async () => {},
    });

    const userTurn = (
      anthropic.requests[0].messages[0] as { content: Array<{ text: string }> }
    ).content[0].text;
    expect(userTurn).toContain("<decisions>");
    expect(userTurn).toContain("meeting_summarized → silence");
    expect(userTurn).toContain("τίποτα κοντά τους αυτή τη φορά");
  });

  it("the conversation the model sees is the real message record — a paused send is excluded", async () => {
    // The core of #9: the prompt's conversation comes from the message table's
    // delivery status, not a journal claim. A delivered message and an inbound
    // reply appear; a send another rail stopped never does, so the agent cannot
    // treat it as one the reader received. The proactive limit is the single
    // exception, and it is labelled — see the NOT SENT case above.
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    const past = new Date(Date.now() - 60 * 60_000);
    db.store.messages.push(
      { id: "d1", subscriptionId: "sub1", direction: "outbound", status: "delivered", body: "Η πλατεία ανακαινίζεται.", createdAt: past },
      { id: "x1", subscriptionId: "sub1", direction: "outbound", status: "suppressed", failureReason: "paused", body: "ΑΥΤΟ δεν εστάλη.", createdAt: past },
      { id: "i1", subscriptionId: "sub1", direction: "inbound", status: null, body: "Πότε αρχίζει;", createdAt: past },
    );
    const silenceTurn = [
      { content: [toolUse("t1", "finish_wake", { rationale: "όχι τώρα" })], stop_reason: "tool_use" },
    ];
    const anthropic = new FakeAnthropic(silenceTurn);

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird: new FakeBird(),
      deps: makeDeps(anthropic),
      alert: async () => {},
    });

    const userTurn = (
      anthropic.requests[0].messages[0] as { content: Array<{ text: string }> }
    ).content[0].text;
    expect(userTurn).toContain("Η πλατεία ανακαινίζεται."); // delivered → shown
    expect(userTurn).toContain("Πότε αρχίζει;"); // inbound → shown
    expect(userTurn).not.toContain("ΑΥΤΟ δεν εστάλη."); // suppressed → hidden
  });

  it("the limit ignores template sends that never reached anyone", async () => {
    // Suppressed and failed rows never arrived, so they buy the reader
    // nothing and cost them nothing. Three of them leave the budget whole.
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    const stopped: Array<[string, string]> = [
      ["suppressed", "proactive limit"],
      ["suppressed", "paused"],
      ["failed", "boom"],
    ];
    seedTemplateSends(db, WEEKLY_TEMPLATE_CAP);
    for (let i = 0; i < WEEKLY_TEMPLATE_CAP; i++) {
      const [status, reason] = stopped[i % stopped.length];
      const row = db.store.messages.find((m) => m.id === `old${i}-0`)!;
      row.status = status;
      row.failureReason = reason;
    }
    const bird = new FakeBird();

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird,
      deps: makeDeps(new FakeAnthropic(sendTurn)),
      alert: async () => {},
    });

    expect(bird.templateSends).toHaveLength(1);
  });

  it("a promised follow-up is capped like any other cold push", async () => {
    // The old per-message cap exempted these. The proactive limit does not:
    // outside the 24h window a promised follow-up buzzes a handset exactly
    // like news does, and the reader asked days ago.
    const replyFollowup: WakeEvent = {
      type: "scheduled",
      at: new Date().toISOString(),
      reason: "υποσχέθηκα να επανέλθω",
      origin: "reply",
    };
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    seedTemplateSends(db, WEEKLY_TEMPLATE_CAP);
    const bird = new FakeBird();
    const anthropic = new FakeAnthropic(sendTurn);

    await processItem(batchItem([replyFollowup]), {
      db,
      bird,
      deps: makeDeps(anthropic),
      alert: async () => {},
    });

    expect(anthropic.requests).toHaveLength(0);
    expect(bird.templateSends).toHaveLength(0);
  });

  it("an unsubscribed-mid-flight reader gets nothing proactive", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB, status: "unsubscribed", unsubscribedAt: new Date() }],
      settings: liveSettings(),
    });
    seedClaim(db);
    const bird = new FakeBird();

    await processItem(batchItem([meetingEvent()]), {
      db,
      bird,
      deps: makeDeps(new FakeAnthropic(sendTurn)),
      alert: async () => {},
    });

    // Better than suppression-at-boundary: the wake is consumed BEFORE the
    // model runs — no outbound row exists at all, no model cost is paid,
    // and the decision log records the model-less skip.
    expect(db.store.messages.filter((m) => m.direction === "outbound")).toHaveLength(0);
    expect(bird.templateSends).toHaveLength(0);
    expect(db.store.wakes).toHaveLength(1);
    expect(db.store.wakes[0].rationale).toContain("απεγγράφηκε");
    expect(db.store.wakes[0].model ?? null).toBeNull();
    expect(db.store.queue.get("q1")?.status).toBe("done");
  });

  it("a coalesced wake persists the primary event plus the full array and scheduled origin", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    const turns = [
      {
        content: [
          toolUse("t1", "schedule_wakeup", {
            at: "2026-09-01T10:00:00.000Z",
            reason: "παρακολούθηση",
          }),
          toolUse("t2", "finish_wake", { rationale: "Σημείωσα." }),
        ],
        stop_reason: "tool_use",
      },
    ];
    const agenda = { ...meetingEvent(), type: "agenda_processed" } as WakeEvent;
    const summarized = meetingEvent();

    await processItem(batchItem([agenda, summarized]), {
      db,
      bird: new FakeBird(),
      deps: makeDeps(new FakeAnthropic(turns)),
      alert: async () => {},
    });

    const wake = db.store.wakes[0];
    expect(wake.eventType).toBe("meeting_summarized");
    expect((wake.events as unknown[]).length).toBe(2);
    expect(db.store.scheduled[0].origin).toBe("proactive");
    expect(db.store.queue.get("q1")?.status).toBe("done");
  });
});

describe("link_path on template sends", () => {
  /**
   * The regression guard for the production 422. Three shells declare
   * {{link_path}} in Bird and reject the send without it — terminally, so the
   * message is lost rather than retried. These assert the value actually
   * reaches Bird, and that the event beats the body link.
   */
  const meetingWake = (events: unknown) => ({
    id: "w-link",
    subscriptionId: "sub1",
    eventType: "meeting_summarized",
    eventAt: new Date("2026-07-29T18:00:00.000Z"),
    createdAt: new Date("2026-07-29T18:00:00.000Z"),
    decision: "send",
    rationale: "r",
    event: events,
  });

  const pendingTemplate = (overrides: Record<string, unknown> = {}) => ({
    id: "m-link",
    subscriptionId: "sub1",
    direction: "outbound",
    status: "pending",
    channel: "whatsapp",
    deliveryMode: "template",
    template: "demos_update_news",
    proactive: true,
    railed: false,
    wakeId: "w-link",
    body: "Νέα από τον δήμο. Δες https://opencouncil.gr/athens/OTHER/subjects/xyz",
    createdAt: new Date(),
    ...overrides,
  });

  it("sends the meeting from the wake's event, not the first link in the body", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB }],
      settings: [{ key: "proactivePaused", value: false }],
    });
    db.store.wakes.push(
      meetingWake({
        type: "meeting_summarized",
        at: "2026-07-29T18:00:00.000Z",
        cityId: "athens",
        meetingId: "jul29_2_2026",
        meetingName: "x",
        meetingDate: "2026-07-29T12:00:00.000Z",
        brief: { cityId: "athens", meetingId: "jul29_2_2026", generatedAt: "2026-07-29T18:00:00.000Z", headline: "h", subjects: [] },
      }),
    );
    db.store.messages.push(pendingTemplate());
    const bird = new FakeBird();

    await deliverPendingMessage(db, bird, "m-link", SUB_ARG, async () => {});

    expect(bird.templateSends).toHaveLength(1);
    // The event wins: the body's link points somewhere else entirely.
    expect(bird.templateSends[0].linkPath).toBe("athens/jul29_2_2026");
  });

  it("falls back to the body link when the event names no meeting", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB }],
      settings: [{ key: "proactivePaused", value: false }],
    });
    db.store.wakes.push(
      meetingWake({ type: "scheduled", at: "2026-07-29T18:00:00.000Z", reason: "promised" }),
    );
    db.store.messages.push(
      pendingTemplate({
        template: "demos_followup",
        body: "Σχετικά με αυτό που ρώτησες: https://opencouncil.gr/athens/aug18_2026",
      }),
    );
    const bird = new FakeBird();

    await deliverPendingMessage(db, bird, "m-link", SUB_ARG, async () => {});

    expect(bird.templateSends[0].linkPath).toBe("athens/aug18_2026");
  });

  it("sends no link path for a shell that declares none", async () => {
    const db = makeFakeDb({
      subscriptions: [{ ...SUB }],
      settings: [{ key: "proactivePaused", value: false }],
    });
    db.store.messages.push(
      pendingTemplate({ template: "demos_transition", wakeId: null, body: "Οι ειδοποιήσεις αλλάζουν." }),
    );
    const bird = new FakeBird();

    await deliverPendingMessage(db, bird, "m-link", SUB_ARG, async () => {});

    // bird.ts drops it on the floor for a fixed shell; nothing to resolve.
    expect(bird.templateSends[0].linkPath).toBeUndefined();
  });
});
