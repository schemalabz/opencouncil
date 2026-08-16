import { FakeAnthropic, makeDeps, toolUse } from "../../agent/__tests__/helpers";
import type { BirdLike, BirdSendResult } from "../bird";
import { MAX_ATTEMPTS, type ClaimedItem } from "../queue-core";
import { processItem } from "../queue";
import type { PrismaClient } from "../../../generated/client";

/**
 * processItem against an in-memory Prisma fake: the shell's ordering
 * invariants (wake committed before Bird, idempotency key = message id,
 * failure → pending retry with Bird untouched) are what's under test —
 * runWake itself has its own suite.
 */

type Row = Record<string, unknown>;

function makeFakeDb(subscription: Row) {
  const calls: string[] = [];
  const store = {
    subscriptions: new Map<string, Row>([[subscription.id as string, subscription]]),
    journal: [] as Row[],
    messages: [] as Row[],
    wakes: [] as Row[],
    scheduled: [] as Row[],
    queue: new Map<string, Row>(),
  };
  let nextId = 1;
  const id = (prefix: string) => `${prefix}_${nextId++}`;

  const db = {
    calls,
    store,
    notisSubscription: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.subscriptions.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = store.subscriptions.get(where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    notisJournalEntry: {
      findMany: async () => [...store.journal],
      aggregate: async () => ({
        _max: { seq: store.journal.length ? Math.max(...store.journal.map((j) => j.seq as number)) : null },
      }),
      create: async ({ data }: { data: Row }) => {
        const row = { id: id("j"), ...data };
        store.journal.push(row);
        return row;
      },
    },
    notisMessage: {
      findFirst: async () => {
        const inbound = store.messages.filter((m) => m.direction === "inbound");
        return inbound.length ? inbound[inbound.length - 1] : null;
      },
      findMany: async () => [...store.messages],
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.messages.find((m) => m.id === where.id) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row: Row = { id: id("msg"), createdAt: new Date(), status: null, ...data };
        store.messages.push(row);
        calls.push(`message-created:${row.direction}`);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = store.messages.find((m) => m.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: Row }) => {
        for (const row of store.messages.filter((m) => where.id.in.includes(m.id as string))) {
          Object.assign(row, data);
        }
      },
    },
    notisWake: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: id("wake"), ...data };
        store.wakes.push(row);
        calls.push("wake-created");
        return row;
      },
    },
    notisScheduledWake: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: id("sw"), ...data };
        store.scheduled.push(row);
        return row;
      },
    },
    notisWakeQueue: {
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = store.queue.get(where.id) ?? { id: where.id };
        Object.assign(row, data);
        store.queue.set(where.id, row);
        calls.push(`queue:${data.status}`);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => store.queue.get(where.id) ?? null,
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(db),
  };
  return db as typeof db & PrismaClient;
}

class FakeBird implements BirdLike {
  public sends: Array<{ conversationId: string; text: string; idempotencyKey: string }> = [];
  constructor(private result: BirdSendResult = { success: true, messageId: "bird-1" }) {}
  async sendText(input: { conversationId: string; text: string; idempotencyKey: string }) {
    this.sends.push(input);
    return this.result;
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
  profileText: "Μένει στην Κυψέλη.",
  cities: [{ cityId: "athens", cityName: "Αθήνα", topics: [], locations: [] }],
  userName: "Μαρία",
};

const ITEM: ClaimedItem = {
  id: "q1",
  subscriptionId: "sub1",
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

describe("processItem", () => {
  it("persists the wake, journal and message BEFORE calling Bird, keyed by the message id", async () => {
    const db = makeFakeDb({ ...SUB });
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
    expect(db.store.journal).toHaveLength(1);
    expect(db.store.journal[0].seq).toBe(1);
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

    // Ordering: the wake row and the done-mark precede the send.
    const sendIndex = db.calls.indexOf("message-created:outbound");
    expect(db.calls.indexOf("wake-created")).toBeLessThan(sendIndex);
    expect(alerts).toHaveLength(0);
  });

  it("returns the item to pending when the wake throws — Bird untouched, nothing persisted", async () => {
    const db = makeFakeDb({ ...SUB });
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
    const db = makeFakeDb({ ...SUB });
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
    const db = makeFakeDb({ ...SUB });
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
    const db = makeFakeDb({ ...SUB });
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
});
