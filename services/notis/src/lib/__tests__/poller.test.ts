import type { EditorialBrief } from "../../agent/types";
import { MAX_EVENTS_PER_TICK, runPollerTick } from "../poller";
import { PROACTIVE_PAUSED_KEY } from "../settings";
import { type FakeDb, type Row, makeFakeDb } from "./fake-db";
import { FakeBird } from "./fake-bird";

/**
 * The poller's four phases against fakes. enqueueBatchWake is mocked onto
 * the fake store (its SQL coalescing is integration-tested on real
 * Postgres); everything else runs the real code.
 */

jest.mock("../queue-core", () => {
  const actual = jest.requireActual("../queue-core");
  return {
    ...actual,
    enqueueBatchWake: jest.fn(
      async (
        db: { store: { queue: Map<string, Row> } },
        input: { subscriptionId: string; event: unknown; runAfter: Date },
      ) => {
        for (const row of db.store.queue.values()) {
          if (
            row.subscriptionId === input.subscriptionId &&
            row.lane === "batch" &&
            row.status === "pending"
          ) {
            (row.events as unknown[]).push(input.event);
            if (input.runAfter < (row.runAfter as Date)) row.runAfter = input.runAfter;
            return { id: row.id as string, coalesced: true };
          }
        }
        const id = `q_${db.store.queue.size + 1}`;
        db.store.queue.set(id, {
          id,
          subscriptionId: input.subscriptionId,
          lane: "batch",
          status: "pending",
          events: [input.event],
          runAfter: input.runAfter,
          attempts: 0,
        });
        return { id, coalesced: false };
      },
    ),
  };
});

const NOW = new Date("2026-08-18T09:00:00.000Z"); // 12:00 Athens — active hours
const now = () => new Date(NOW);

interface FakeMainSeed {
  users?: Row[];
  targets?: Row[];
  events?: Row[];
}

function makeFakeMain(seed: FakeMainSeed = {}) {
  const users = seed.users ?? [];
  const targets = seed.targets ?? [];
  const events = seed.events ?? [];
  return {
    notisUserRow: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        users.filter((u) => where.id.in.includes(u.id as string)),
    },
    fanoutTargetRow: {
      findMany: async ({ where }: { where: Row }) =>
        targets.filter((t) => {
          if (where.userId && !(where.userId as { in: string[] }).in.includes(t.userId as string))
            return false;
          if (where.notisEnabledAt && t.notisEnabledAt === null) return false;
          if (where.notifyByPhone !== undefined && t.notifyByPhone !== where.notifyByPhone)
            return false;
          if (where.phone && t.phone === null) return false;
          return true;
        }),
    },
    meetingEventRow: {
      findMany: async ({ where }: { where: Row }) =>
        events.filter((e) => {
          if (where.released !== undefined && e.released !== where.released) return false;
          const gte = (where.completedAt as { gte?: Date } | undefined)?.gte;
          if (gte && (e.completedAt as Date) < gte) return false;
          return true;
        }),
    },
  } as unknown as import("../../../generated/main-client").PrismaClient;
}

const BRIEF: EditorialBrief = {
  cityId: "athens",
  meetingId: "m1",
  generatedAt: NOW.toISOString(),
  headline: "x",
  subjects: [],
};

function target(userId: string, cityId: string, overrides: Row = {}): Row {
  return {
    userId,
    cityId,
    cityName: cityId === "athens" ? "Αθήνα" : cityId,
    cityNameEn: cityId,
    realm: "greece",
    language: "el",
    timezone: "Europe/Athens",
    topics: [],
    locations: [],
    phone: "+306900000001",
    userName: "Μαρία",
    notisEnabledAt: new Date("2026-08-01"),
    notifyByPhone: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

function meetingRow(taskId: string, overrides: Row = {}): Row {
  return {
    taskId,
    type: "summarize",
    completedAt: new Date(NOW.getTime() - 3_600_000),
    cityId: "athens",
    meetingId: "m1",
    meetingName: "Δημοτικό Συμβούλιο",
    meetingDate: new Date("2026-08-17T18:00:00.000Z"),
    released: true,
    adminBodyName: null,
    realm: "greece",
    language: "el",
    timezone: "Europe/Athens",
    ...overrides,
  };
}

const activeSub = (id: string, userId: string, cities: unknown[] = []): Row => ({
  id,
  userId,
  phone: "+306900000001",
  status: "active",
  origin: "transition",
  unsubscribedAt: null,
  birdConversationId: null,
  profileText: "x",
  cities,
  userName: "Μαρία",
});

const editorialOk = jest.fn(async () => ({ brief: BRIEF, costUsd: 0.07 }));

beforeEach(() => {
  editorialOk.mockClear();
});

describe("enrollment", () => {
  it("unpaused: creates the subscription, journals, and sends the intro via a new conversation", async () => {
    const db = makeFakeDb({ settings: [{ key: PROACTIVE_PAUSED_KEY, value: false }] });
    const bird = new FakeBird();
    const main = makeFakeMain({
      targets: [target("user9", "athens", { phone: "306999999999" })],
    });

    const result = await runPollerTick({ db, main, bird, alert: async () => {}, now });

    expect(result.enrolled).toBe(1);
    expect(result.introsSent).toBe(1);
    const sub = [...db.store.subscriptions.values()][0];
    expect(sub).toMatchObject({
      userId: "user9",
      origin: "transition",
      status: "active",
      phone: "+306999999999",
      birdConversationId: "conv-new-1",
    });
    expect(String(sub.profileText)).toContain("Αθήνα");
    expect(db.store.journal[0].entry).toMatchObject({ event: "enrollment" });
    expect(bird.created).toHaveLength(1);
    expect(bird.created[0].template).toBe("demos_transition");
    const intro = db.store.messages[0];
    expect(intro).toMatchObject({ status: "sent", template: "demos_transition", proactive: true });
  });

  it("paused (the default, no settings rows): the enrollment phase is skipped entirely", async () => {
    const db = makeFakeDb();
    const main = makeFakeMain({ targets: [target("user9", "athens")] });

    const result = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now });

    expect(result.enrolled).toBe(0);
    expect(db.store.subscriptions.size).toBe(0);
  });

  it("never enrolls: missing phone, notifyByPhone off, or an existing (even unsubscribed) subscription", async () => {
    const db = makeFakeDb({
      subscriptions: [
        { ...activeSub("sub1", "user1"), status: "unsubscribed", unsubscribedAt: new Date() },
      ],
      settings: [{ key: PROACTIVE_PAUSED_KEY, value: false }],
    });
    const main = makeFakeMain({
      targets: [
        target("user1", "athens"), // existing unsubscribed sub — never resurrect
        target("user2", "athens", { phone: null }),
        target("user3", "athens", { notifyByPhone: false }),
      ],
    });

    const result = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now });

    expect(result.enrolled).toBe(0);
    expect(db.store.subscriptions.size).toBe(1);
    expect(db.store.subscriptions.get("sub1")?.status).toBe("unsubscribed");
  });
});

describe("reconciliation", () => {
  it("refreshes a changed phone and the cities snapshot, counts each once", async () => {
    const db = makeFakeDb({ subscriptions: [activeSub("sub1", "user1")] });
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306911111111" }],
      targets: [target("user1", "athens", { phone: "+306911111111" })],
    });

    const result = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now });

    const sub = db.store.subscriptions.get("sub1")!;
    expect(sub.phone).toBe("+306911111111");
    expect(result.phonesRefreshed).toBe(1);
    expect(result.citiesRefreshed).toBe(1);
    expect((sub.cities as unknown[]).length).toBe(1);
  });

  it("phone gone: unsubscribes the active subscription once, with a system journal entry", async () => {
    const db = makeFakeDb({ subscriptions: [activeSub("sub1", "user1")] });
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: null }],
      targets: [],
    });

    const result = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now });

    const sub = db.store.subscriptions.get("sub1")!;
    expect(sub.status).toBe("unsubscribed");
    expect(result.phoneGoneUnsubscribed).toBe(1);
    expect(db.store.journal[0].entry).toMatchObject({ event: "system", decision: "silence" });

    // A second tick touches nothing — never a double journal, never a re-activation.
    const again = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now });
    expect(again.phoneGoneUnsubscribed).toBe(0);
    expect(db.store.journal).toHaveLength(1);
  });

  it("a user row missing entirely is the janitor's problem, not the poller's", async () => {
    const db = makeFakeDb({ subscriptions: [activeSub("sub1", "user1")] });
    const main = makeFakeMain({ users: [], targets: [] });

    await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now });

    expect(db.store.subscriptions.get("sub1")?.status).toBe("active");
  });
});

describe("scheduled fires", () => {
  it("fires a due note once (fenced), clamped into active hours, batch-lane", async () => {
    const db = makeFakeDb({ subscriptions: [activeSub("sub1", "user1")] });
    db.store.scheduled.push({
      id: "sw1",
      subscriptionId: "sub1",
      runAfter: new Date(NOW.getTime() - 60_000),
      reason: "υποσχέθηκα",
      origin: "reply",
      firedAt: null,
    });

    const result = await runPollerTick({ db, bird: new FakeBird(), alert: async () => {}, now });

    expect(result.scheduledFired).toBe(1);
    expect(db.store.scheduled[0].firedAt).not.toBeNull();
    const row = [...db.store.queue.values()][0];
    expect(row.lane).toBe("batch");
    expect((row.events as Array<{ type: string; origin?: string }>)[0]).toMatchObject({
      type: "scheduled",
      origin: "reply",
    });

    const again = await runPollerTick({ db, bird: new FakeBird(), alert: async () => {}, now });
    expect(again.scheduledFired).toBe(0);
  });

  it("consumes an unsubscribed reader's note without a wake", async () => {
    const db = makeFakeDb({
      subscriptions: [
        { ...activeSub("sub1", "user1"), status: "unsubscribed", unsubscribedAt: new Date() },
      ],
    });
    db.store.scheduled.push({
      id: "sw1",
      subscriptionId: "sub1",
      runAfter: new Date(NOW.getTime() - 60_000),
      reason: "x",
      origin: "reply",
      firedAt: null,
    });

    const result = await runPollerTick({ db, bird: new FakeBird(), alert: async () => {}, now });

    expect(result.scheduledFired).toBe(0);
    expect(db.store.scheduled[0].firedAt).not.toBeNull();
    expect(db.store.queue.size).toBe(0);
  });

  it("a note due at 02:00 Athens lands after the 09:00 release", async () => {
    const nightNow = () => new Date("2026-08-18T23:30:00.000Z"); // 02:30 Athens (next day)
    const db = makeFakeDb({ subscriptions: [activeSub("sub1", "user1")] });
    db.store.scheduled.push({
      id: "sw1",
      subscriptionId: "sub1",
      runAfter: new Date("2026-08-18T23:00:00.000Z"),
      reason: "x",
      origin: "reply",
      firedAt: null,
    });

    await runPollerTick({ db, bird: new FakeBird(), alert: async () => {}, now: nightNow, rng: () => 0 });

    const row = [...db.store.queue.values()][0];
    // Next Athens 09:00 after 02:30 EEST = 06:00Z the same day.
    expect((row.runAfter as Date).toISOString()).toBe("2026-08-19T06:00:00.000Z");
  });
});

describe("meeting events", () => {
  function seededDb(): FakeDb {
    return makeFakeDb({
      subscriptions: [
        activeSub("sub1", "user1", [{ cityId: "athens", cityName: "Αθήνα", topics: [], locations: [] }]),
      ],
    });
  }

  it("fans out a released event to matching active subs, records the brief and cost", async () => {
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: [meetingRow("task1")],
    });

    const result = await runPollerTick({
      db,
      main,
      bird: new FakeBird(),
      alert: async () => {},
      now,
      editorial: editorialOk,
    });

    expect(editorialOk).toHaveBeenCalledTimes(1);
    expect(editorialOk).toHaveBeenCalledWith("athens", "m1", "summary");
    expect(result.eventsProcessed).toBe(1);
    expect(result.wakesEnqueued).toBe(1);
    expect(result.editorialCostUsd).toBeCloseTo(0.07);
    expect(db.store.processedEvents.get("task1")).toMatchObject({ briefCostUsd: 0.07 });
    const row = [...db.store.queue.values()][0];
    expect((row.events as Array<{ type: string }>)[0].type).toBe("meeting_summarized");
  });

  it("unreleased events are skipped AND not recorded — a later release fires naturally", async () => {
    const db = seededDb();
    const events = [meetingRow("task1", { released: false })];
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events,
    });

    const first = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now, editorial: editorialOk });
    expect(first.eventsProcessed).toBe(0);
    expect(db.store.processedEvents.size).toBe(0);

    events[0].released = true;
    const second = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now, editorial: editorialOk });
    expect(second.eventsProcessed).toBe(1);
  });

  it("dedups by taskId across ticks", async () => {
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: [meetingRow("task1")],
    });

    await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now, editorial: editorialOk });
    const again = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now, editorial: editorialOk });

    expect(again.eventsProcessed).toBe(0);
    expect(editorialOk).toHaveBeenCalledTimes(1);
    expect(db.store.queue.size).toBe(1);
  });

  it("an event with no audience is consumed without paying for an editorial pass", async () => {
    const db = makeFakeDb();
    const main = makeFakeMain({ events: [meetingRow("task1")] });

    const result = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now, editorial: editorialOk });

    expect(result.eventsProcessed).toBe(1);
    expect(editorialOk).not.toHaveBeenCalled();
    expect(db.store.processedEvents.get("task1")?.brief).toBeUndefined();
  });

  it("an editorial failure alerts, records nothing, and does not starve later events", async () => {
    const db = makeFakeDb({
      subscriptions: [
        activeSub("sub1", "user1", [{ cityId: "athens", cityName: "Αθήνα", topics: [], locations: [] }]),
        activeSub("sub2", "user2", [{ cityId: "patras", cityName: "Πάτρα", topics: [], locations: [] }]),
      ],
    });
    const main = makeFakeMain({
      users: [
        { id: "user1", name: "Μαρία", phone: "+306900000001" },
        { id: "user2", name: "Νίκος", phone: "+306900000002" },
      ],
      targets: [target("user1", "athens"), target("user2", "patras", { phone: "+306900000002" })],
      events: [meetingRow("task1"), meetingRow("task2", { cityId: "patras", meetingId: "m2" })],
    });
    const alerts: string[] = [];
    const editorial = jest.fn(async (cityId: string) => {
      if (cityId === "athens") throw new Error("boom");
      return { brief: { ...BRIEF, cityId: "patras", meetingId: "m2" }, costUsd: 0.05 };
    });

    const result = await runPollerTick({
      db,
      main,
      bird: new FakeBird(),
      alert: async (m) => {
        alerts.push(m);
      },
      now,
      editorial,
    });

    expect(alerts.some((m) => m.includes("task1"))).toBe(true);
    expect(db.store.processedEvents.has("task1")).toBe(false); // retried next tick
    expect(db.store.processedEvents.has("task2")).toBe(true);
    expect(result.eventsProcessed).toBe(1);
  });

  it("one reader in two cities gets ONE coalesced batch row", async () => {
    const db = makeFakeDb({
      subscriptions: [
        activeSub("sub1", "user1", [
          { cityId: "athens", cityName: "Αθήνα", topics: [], locations: [] },
          { cityId: "patras", cityName: "Πάτρα", topics: [], locations: [] },
        ]),
      ],
    });
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens"), target("user1", "patras")],
      events: [meetingRow("task1"), meetingRow("task2", { cityId: "patras", meetingId: "m2" })],
    });
    const editorial = jest.fn(async (cityId: string, meetingId: string) => ({
      brief: { ...BRIEF, cityId, meetingId },
      costUsd: 0.05,
    }));

    const result = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now, editorial });

    expect(result.wakesEnqueued).toBe(2);
    expect(db.store.queue.size).toBe(1);
    const row = [...db.store.queue.values()][0];
    expect((row.events as unknown[]).length).toBe(2);
  });

  it("caps editorial spend per tick; the backlog drains next tick", async () => {
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: Array.from({ length: MAX_EVENTS_PER_TICK + 2 }, (_, i) =>
        meetingRow(`task${i}`, { meetingId: `m${i}` }),
      ),
    });
    const editorial = jest.fn(async (cityId: string, meetingId: string) => ({
      brief: { ...BRIEF, meetingId },
      costUsd: 0.05,
    }));

    const first = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now, editorial });
    expect(first.eventsProcessed).toBe(MAX_EVENTS_PER_TICK);

    const second = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now, editorial });
    expect(second.eventsProcessed).toBe(2);
  });

  it("seedOnly marks the whole backlog consumed and wakes nobody", async () => {
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: Array.from({ length: MAX_EVENTS_PER_TICK + 3 }, (_, i) =>
        meetingRow(`task${i}`, { meetingId: `m${i}` }),
      ),
    });

    const result = await runPollerTick(
      { db, main, bird: new FakeBird(), alert: async () => {}, now, editorial: editorialOk },
      { seedOnly: true },
    );

    expect(result.eventsProcessed).toBe(MAX_EVENTS_PER_TICK + 3);
    expect(editorialOk).not.toHaveBeenCalled();
    expect(db.store.queue.size).toBe(0);
  });
});
