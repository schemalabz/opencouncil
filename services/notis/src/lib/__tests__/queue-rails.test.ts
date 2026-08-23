import { FakeAnthropic, makeDeps, meetingEvent, toolUse } from "../../agent/__tests__/helpers";
import { WakeEvent } from "../../agent/types";
import { type ClaimedItem } from "../queue-core";
import { PROACTIVE_PAUSED_KEY } from "../settings";
import { WEEKLY_CAP, processItem } from "../queue";
import { type Row, makeFakeDb } from "./fake-db";
import { FakeBird } from "./fake-bird";

/**
 * The proactive send boundary: shadow, pause, weekly cap, unsubscribed —
 * and the classes that bypass or soften them (reactive, reply-continuation).
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

  it("weekly cap: a saturated reader's unprompted wake never reaches the model", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    for (let i = 0; i < WEEKLY_CAP; i++) {
      db.store.messages.push({
        id: `old${i}`,
        subscriptionId: "sub1",
        direction: "outbound",
        body: `παλιό μήνυμα ${i}`,
        proactive: true,
        status: "sent",
        failureReason: null,
        createdAt: new Date(Date.now() - (i + 1) * 3_600_000),
      });
    }
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
    expect(db.store.messages.some((m) => m.wakeId)).toBe(false);
    expect(db.store.queue.get("q1")?.status).toBe("done");
    // A model-less wake row says what went unexamined, so the next wake's
    // decision log is not left believing this reader was told.
    const skipped = db.store.wakes.at(-1)!;
    expect(skipped.decision).toBe("silence");
    expect(skipped.model ?? null).toBeNull();
    expect(String(skipped.rationale)).toContain("δεν εξετάστηκε");
  });

  it("weekly cap filled DURING the wake: the send is suppressed", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    const bird = new FakeBird();
    // The cap is clear at claim time and full by the time the boundary runs
    // — the race the pre-model check cannot see.
    // The cap fills WHILE the model runs — the one case the pre-model check
    // cannot see, modelled by a client that writes the sends as it answers.
    const scripted = new FakeAnthropic(sendTurn);
    const anthropic = {
      create: async (params: Parameters<typeof scripted.create>[0]) => {
        for (let i = 0; i < WEEKLY_CAP; i++) {
          db.store.messages.push({
            id: `mid${i}`,
            subscriptionId: "sub1",
            direction: "outbound",
            body: `ενδιάμεσο μήνυμα ${i}`,
            proactive: true,
            status: "sent",
            failureReason: null,
            createdAt: new Date(),
          });
        }
        return scripted.create(params);
      },
    };
    const deps = makeDeps(anthropic);

    await processItem(batchItem([meetingEvent()]), { db, bird, deps, alert: async () => {} });

    const outbound = db.store.messages.find((m) => m.wakeId)!;
    expect(outbound.status).toBe("suppressed");
    expect(outbound.failureReason).toBe("weekly cap");
    expect(bird.templateSends).toHaveLength(0);
    // No correction is written anywhere: the suppressed row is simply
    // excluded from the conversation the next wake reads, so the agent
    // cannot mistake it for a delivered message.
    expect(db.store.wakes.filter((w) => (w.model ?? null) === null)).toHaveLength(0);
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

  it("the conversation the model sees is the real message record — a suppressed message is excluded", async () => {
    // The core of #9: the prompt's conversation comes from the message table's
    // delivery status, not a journal claim. A delivered message and an inbound
    // reply appear; a suppressed one never does, so the agent cannot treat a
    // stopped send as one the reader received.
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    const past = new Date(Date.now() - 60 * 60_000);
    db.store.messages.push(
      { id: "d1", subscriptionId: "sub1", direction: "outbound", status: "delivered", body: "Η πλατεία ανακαινίζεται.", createdAt: past },
      { id: "x1", subscriptionId: "sub1", direction: "outbound", status: "suppressed", body: "ΑΥΤΟ δεν εστάλη.", createdAt: past },
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

  it("cap ignores rows that never reached anyone (cap/pause suppressions, failures)", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    for (const [i, [status, reason]] of [
      ["suppressed", "weekly cap"],
      ["suppressed", "paused"],
      ["failed", "boom"],
    ].entries()) {
      db.store.messages.push({
        id: `old${i}`,
        subscriptionId: "sub1",
        direction: "outbound",
        proactive: true,
        status,
        failureReason: reason,
        createdAt: new Date(Date.now() - (i + 1) * 3_600_000),
      });
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

  it("a promised follow-up (scheduled, origin reply) is cap-exempt", async () => {
    const replyFollowup: WakeEvent = {
      type: "scheduled",
      at: new Date().toISOString(),
      reason: "υποσχέθηκα να επανέλθω",
      origin: "reply",
    };
    // At the cap: the follow-up still goes out.
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    for (let i = 0; i < WEEKLY_CAP; i++) {
      db.store.messages.push({
        id: `old${i}`,
        subscriptionId: "sub1",
        direction: "outbound",
        body: `παλιό μήνυμα ${i}`,
        proactive: true,
        status: "sent",
        failureReason: null,
        createdAt: new Date(Date.now() - (i + 1) * 3_600_000),
      });
    }
    const bird = new FakeBird();
    await processItem(batchItem([replyFollowup]), {
      db,
      bird,
      deps: makeDeps(new FakeAnthropic(sendTurn)),
      alert: async () => {},
    });
    const followup = db.store.messages.find((m) => m.wakeId)!;
    expect(followup.status).toBe("sent");
    expect(followup.template).toBe("demos_followup");
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

    const outbound = db.store.messages.find((m) => m.direction === "outbound")!;
    expect(outbound.status).toBe("suppressed");
    expect(outbound.failureReason).toBe("unsubscribed");
    expect(bird.templateSends).toHaveLength(0);
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
