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

  it("weekly cap: the fourth unprompted message in a rolling week is suppressed", async () => {
    const db = makeFakeDb({ subscriptions: [{ ...SUB }], settings: liveSettings() });
    seedClaim(db);
    for (let i = 0; i < WEEKLY_CAP; i++) {
      db.store.messages.push({
        id: `old${i}`,
        subscriptionId: "sub1",
        direction: "outbound",
        proactive: true,
        status: "sent",
        failureReason: null,
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

    const outbound = db.store.messages.find((m) => m.wakeId)!;
    expect(outbound.status).toBe("suppressed");
    expect(outbound.failureReason).toBe("weekly cap");
    expect(bird.templateSends).toHaveLength(0);
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
