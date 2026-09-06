import type { EditorialBrief } from "../../agent/types";
import { MAX_EVENTS_PER_TICK, classifyEvent, runPollerTick } from "../poller";
import { PROACTIVE_PAUSED_KEY, futureSummaryAlertKey } from "../settings";
import { type FakeDb, type Row, eventIdentity, makeFakeDb } from "./fake-db";
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

/** The processed row for one meeting and phase — the dedup identity. */
function processedFor(db: FakeDb, cityId: string, meetingId: string, type: string) {
  return db.store.processedEvents.get(eventIdentity({ cityId, meetingId, type }));
}
const now = () => new Date(NOW);

interface FakeMainSeed {
  users?: Row[];
  targets?: Row[];
  events?: Row[];
}

const USER_CREATED_AT = new Date("2026-06-01T00:00:00.000Z");

function makeFakeMain(seed: FakeMainSeed = {}) {
  const targets = seed.targets ?? [];
  // Reconcile reads the account's phone and name from notis_users. A seed
  // that names only targets gets one user row per target, so the two views
  // agree the way the real ones do.
  const users =
    seed.users ??
    [...new Map(targets.map((t) => [t.userId as string, t])).values()].map((t) => ({
      id: t.userId,
      name: t.userName ?? null,
      phone: t.phone ?? null,
      createdAt: USER_CREATED_AT,
    }));
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
          if (where.cityId && !(where.cityId as { in: string[] }).in.includes(t.cityId as string))
            return false;
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

const activeSub = (id: string, userId: string): Row => ({
  id,
  userId,
  phone: "+306900000001",
  status: "active",
  origin: "transition",
  unsubscribedAt: null,
  birdConversationId: null,
  profileText: "x",
  userName: "Μαρία",
});

const editorialOk = jest.fn(async () => ({ brief: BRIEF, costUsd: 0.07 }));

beforeEach(() => {
  editorialOk.mockClear();
});

describe("enrollment", () => {
  it("holds the whole ceremony through quiet hours — the intro is a cold proactive template", async () => {
    const db = makeFakeDb({ settings: [{ key: PROACTIVE_PAUSED_KEY, value: false }] });
    const bird = new FakeBird();
    const main = makeFakeMain({ targets: [target("user9", "athens", { phone: "306999999999" })] });
    // 01:30 Athens.
    const night = () => new Date("2026-03-10T23:30:00.000Z");

    const result = await runPollerTick({ db, main, bird, alert: async () => {}, now: night });

    expect(result.enrolled).toBe(0);
    expect(db.store.subscriptions.size).toBe(0);
    expect(bird.created).toHaveLength(0);
  });

  it("enrolls nobody while their intro template has no project id, and says so once", async () => {
    const db = makeFakeDb({ settings: [{ key: PROACTIVE_PAUSED_KEY, value: false }] });
    const bird = new FakeBird();
    bird.templatesConfigured = false;
    const main = makeFakeMain({ targets: [target("user9", "athens", { phone: "306999999999" })] });
    const alerts: string[] = [];
    const alert = async (m: string) => {
      alerts.push(m);
    };

    const result = await runPollerTick({ db, main, bird, alert, now });
    await runPollerTick({ db, main, bird, alert, now });

    // Enrolling here would burn the cohort: the subscription exists forever
    // after, and every later tick skips it — with no intro ever sent.
    expect(result.enrolled).toBe(0);
    expect(result.enrollmentDeferred).toBe(1);
    expect(db.store.subscriptions.size).toBe(0);
    expect(alerts.filter((m) => m.includes("notis_intro template has no Bird project id"))).toHaveLength(1);
  });

  it("unpaused: creates the subscription and sends the intro via a new conversation", async () => {
    const db = makeFakeDb({ settings: [{ key: PROACTIVE_PAUSED_KEY, value: false }] });
    const bird = new FakeBird();
    const main = makeFakeMain({
      targets: [target("user9", "athens", { phone: "306999999999" })],
    });

    const result = await runPollerTick({ db, main, bird, alert: async () => {}, now });

    expect(result.enrolled).toBe(1);
    expect(result.introsSent).toBe(1);
    const sub = [...db.store.subscriptions.values()][0];
    // Every reader arrives through the site's signup now.
    expect(sub).toMatchObject({
      userId: "user9",
      origin: "signup",
      status: "active",
      phone: "+306999999999",
      birdConversationId: "conv-new-1",
    });
    expect(String(sub.profileText)).toContain("Αθήνα");
    // No decision row for enrollment: the intro reaches the agent through
    // the conversation (its message row) once sent.
    expect(db.store.wakes).toHaveLength(0);
    expect(bird.created).toHaveLength(1);
    expect(bird.created[0].template).toBe("notis_intro");
    const intro = db.store.messages[0];
    expect(intro).toMatchObject({ status: "sent", template: "notis_intro", proactive: true });
  });

  it("enrolls every waiting reader in one tick, each with the signup intro", async () => {
    const db = makeFakeDb({ settings: [{ key: PROACTIVE_PAUSED_KEY, value: false }] });
    const bird = new FakeBird();
    const main = makeFakeMain({
      targets: [
        target("reader-a", "athens", { phone: "+306900000011" }),
        target("reader-b", "athens", { phone: "+306900000012" }),
        target("reader-c", "athens", { phone: "+306900000013" }),
      ],
    });

    const result = await runPollerTick({ db, main, bird, alert: async () => {}, now });

    // No pacing and no second shell: the readers of the old templates moved
    // over from the release panel before the signup switched to Νότης.
    expect(result.enrolled).toBe(3);
    expect(result.enrollmentDeferred).toBe(0);
    expect(bird.created.map((c) => c.template)).toEqual(["notis_intro", "notis_intro", "notis_intro"]);
    expect([...db.store.subscriptions.values()].map((s) => s.origin)).toEqual(["signup", "signup", "signup"]);
  });

  it("holds a +1 number while the intro shell is marketing, and says so once", async () => {
    const db = makeFakeDb({ settings: [{ key: PROACTIVE_PAUSED_KEY, value: false }] });
    const bird = new FakeBird();
    const main = makeFakeMain({
      targets: [
        target("us-reader", "athens", { phone: "+16174613635" }),
        target("gr-reader", "athens", { phone: "+306900000012" }),
      ],
    });
    const alerts: string[] = [];
    const deps = {
      db,
      main,
      bird,
      alert: async (m: string) => {
        alerts.push(m);
      },
      now,
    };

    const result = await runPollerTick(deps);
    await runPollerTick(deps);

    // notis_intro is marketing, which Meta refuses to +1 (131049). The
    // reader's own reply opens the thread without a template.
    expect(result.enrolled).toBe(1);
    expect(result.enrollmentHeld).toBe(1);
    expect(bird.created.map((c) => c.phone)).toEqual(["+306900000012"]);
    expect(alerts.filter((m) => m.includes("us-reader (+1 number while notis_intro is a marketing shell)"))).toHaveLength(1);
  });

  it("repairs a Greek mobile behind a bare plus and enrolls it with its country code", async () => {
    const db = makeFakeDb({ settings: [{ key: PROACTIVE_PAUSED_KEY, value: false }] });
    const bird = new FakeBird();
    // The shape the old phone input let through (2026-09-05 audit).
    const main = makeFakeMain({ targets: [target("user-bare", "athens", { phone: "+6943472297" })] });

    const result = await runPollerTick({ db, main, bird, alert: async () => {}, now });

    expect(result.enrolled).toBe(1);
    expect([...db.store.subscriptions.values()][0].phone).toBe("+306943472297");
    expect(bird.created[0].phone).toBe("+306943472297");
  });

  it("holds a landline instead of enrolling it into silence, and says so once", async () => {
    const db = makeFakeDb({ settings: [{ key: PROACTIVE_PAUSED_KEY, value: false }] });
    const bird = new FakeBird();
    const main = makeFakeMain({
      targets: [target("user-landline", "athens", { phone: "+302106459454" })],
    });
    const alerts: string[] = [];
    const alert = async (m: string) => {
      alerts.push(m);
    };

    const first = await runPollerTick({ db, main, bird, alert, now });
    const second = await runPollerTick({ db, main, bird, alert, now });

    // No subscription, no intro: the user stays enrollable once the number is fixed.
    expect(first.enrolled).toBe(0);
    expect(first.enrollmentHeld).toBe(1);
    expect(second.enrollmentHeld).toBe(1);
    expect(db.store.subscriptions.size).toBe(0);
    expect(bird.created).toHaveLength(0);
    const held = alerts.filter((m) => m.includes("user-landline (landline)"));
    expect(held).toHaveLength(1);
  });

  it("holds a phone that already belongs to another active subscription", async () => {
    const db = makeFakeDb({
      settings: [{ key: PROACTIVE_PAUSED_KEY, value: false }],
      subscriptions: [
        {
          id: "sub-first",
          userId: "user-first",
          phone: "+33749306027",
          status: "active",
          origin: "transition",
          profileText: "x",
        },
      ],
    });
    const bird = new FakeBird();
    const main = makeFakeMain({
      targets: [target("user-second", "athens", { phone: "+33749306027" })],
    });
    const alerts: string[] = [];

    const result = await runPollerTick({
      db,
      main,
      bird,
      alert: async (m) => {
        alerts.push(m);
      },
      now,
    });

    expect(result.enrolled).toBe(0);
    expect(result.enrollmentHeld).toBe(1);
    expect(db.store.subscriptions.size).toBe(1);
    expect(alerts.some((m) => m.includes("user-second (phone already on user-first)"))).toBe(true);
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
  it("refreshes a changed phone, counts it once", async () => {
    const db = makeFakeDb({ subscriptions: [activeSub("sub1", "user1")] });
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306911111111" }],
      targets: [target("user1", "athens", { phone: "+306911111111" })],
    });

    const result = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now });

    const sub = db.store.subscriptions.get("sub1")!;
    expect(sub.phone).toBe("+306911111111");
    expect(result.phonesRefreshed).toBe(1);
  });

  it("phone gone: unsubscribes the active subscription once, with a system decision row", async () => {
    const db = makeFakeDb({ subscriptions: [activeSub("sub1", "user1")] });
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: null }],
      targets: [],
    });

    const result = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now });

    const sub = db.store.subscriptions.get("sub1")!;
    expect(sub.status).toBe("unsubscribed");
    expect(result.phoneGoneUnsubscribed).toBe(1);
    expect(db.store.wakes[0]).toMatchObject({ eventType: "system", decision: "silence" });

    // A second tick touches nothing — never a double decision, never a re-activation.
    const again = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now });
    expect(again.phoneGoneUnsubscribed).toBe(0);
    expect(db.store.wakes).toHaveLength(1);
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
        activeSub("sub1", "user1"),
      ],
    });
  }

  // The whole disposition table in one place, straight off classifyEvent.
  // The poller tests below prove the wiring; this proves the rule.
  describe("classifyEvent", () => {
    const at = new Date(NOW);
    const staleBefore = new Date(NOW.getTime() - 30 * 24 * 60 * 60_000);
    const on = (type: string, meetingDate: string) =>
      classifyEvent({ type, meetingDate: new Date(meetingDate) }, at, staleBefore);

    it.each([
      ["processAgenda", "2026-08-20T18:00:00.000Z", "fanout", "meeting still ahead"],
      ["processAgenda", "2026-08-15T18:00:00.000Z", "late-agenda", "held four days ago"],
      ["processAgenda", "2026-01-10T18:00:00.000Z", "stale", "held months ago"],
      ["summarize", "2026-08-20T18:00:00.000Z", "future-summary", "cannot be summarized yet"],
      ["summarize", "2026-08-15T18:00:00.000Z", "fanout", "held four days ago"],
      ["summarize", "2026-08-04T18:00:00.000Z", "fanout", "held two weeks ago"],
      ["summarize", "2026-01-10T18:00:00.000Z", "stale", "held months ago"],
    ])("%s dated %s → %s (%s)", (type, meetingDate, expected) => {
      expect(on(type, meetingDate)).toBe(expected);
    });
  });

  it("wakes nobody for a city whose reader switched phone delivery off", async () => {
    // notifyByPhone=false is also what a ΣΤΟΠ to the old templates left
    // behind: that reader has a live subscription from an inbound message
    // and must not be woken for the city they opted out of.
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens", { notifyByPhone: false })],
      events: [meetingRow("task-1")],
    });

    const result = await runPollerTick({
      db,
      main,
      bird: new FakeBird(),
      alert: async () => {},
      now,
      editorial: editorialOk,
    });

    expect(result.wakesEnqueued).toBe(0);
    expect(result.eventsProcessed).toBe(1); // consumed: nobody to wake
    expect(editorialOk).not.toHaveBeenCalled();
    expect(db.store.queue.size).toBe(0);
  });

  it("consumes a late agenda without editorial spend or a wake", async () => {
    // processAgenda succeeding AFTER the meeting was held: a late upload or a
    // backfill. Previewing it would describe a meeting the archive already
    // has the transcript of. Its summarize event is the real news.
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: [
        meetingRow("task-late-agenda", {
          type: "processAgenda",
          meetingId: "m-held",
          meetingDate: new Date("2026-08-15T18:00:00.000Z"),
        }),
      ],
    });

    const result = await runPollerTick({
      db,
      main,
      bird: new FakeBird(),
      alert: async () => {},
      now,
      editorial: editorialOk,
    });

    expect(editorialOk).not.toHaveBeenCalled();
    expect(result.lateAgendaConsumed).toBe(1);
    expect(result.wakesEnqueued).toBe(0);
    expect(db.store.queue.size).toBe(0);
    // Recorded, so it stops re-surfacing — and so the dedup identity is taken.
    expect(processedFor(db, "athens", "m-held", "processAgenda")).toBeDefined();
  });

  it("fans out an agenda for a meeting that has not happened yet", async () => {
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: [
        meetingRow("task-agenda", {
          type: "processAgenda",
          meetingId: "m-upcoming",
          meetingDate: new Date("2026-08-20T18:00:00.000Z"),
        }),
      ],
    });

    const result = await runPollerTick({
      db,
      main,
      bird: new FakeBird(),
      alert: async () => {},
      now,
      editorial: editorialOk,
    });

    expect(result.lateAgendaConsumed).toBe(0);
    expect(result.wakesEnqueued).toBe(1);
    const [event] = [...db.store.queue.values()][0].events as Array<{ type: string }>;
    expect(event.type).toBe("agenda_processed");
  });

  it("holds a summary for a future-dated meeting, alarms once, and never consumes it", async () => {
    // A meeting cannot be summarized before it happens: the dateTime is
    // wrong. Nobody is woken, ops hears about it once rather than every
    // five-minute tick, and the event stays available for a corrected date.
    const db = seededDb();
    const events = [
      meetingRow("task-future", {
        meetingId: "m-future",
        meetingDate: new Date("2026-08-20T18:00:00.000Z"),
      }),
    ];
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events,
    });
    const alerts: string[] = [];
    const opts = {
      db,
      main,
      bird: new FakeBird(),
      alert: async (m: string) => {
        alerts.push(m);
      },
      now,
      editorial: editorialOk,
    };

    const result = await runPollerTick(opts);

    expect(editorialOk).not.toHaveBeenCalled();
    expect(result.futureSummaryHeld).toBe(1);
    expect(result.wakesEnqueued).toBe(0);
    expect(db.store.queue.size).toBe(0);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("athens/m-future");
    // Not consumed: the dedup identity stays free.
    expect(processedFor(db, "athens", "m-future", "summarize")).toBeUndefined();
    expect(db.store.settings.get(futureSummaryAlertKey("athens", "m-future"))).toBeDefined();

    // Second tick: still held, but the alarm does not repeat.
    const again = await runPollerTick(opts);
    expect(again.futureSummaryHeld).toBe(1);
    expect(alerts).toHaveLength(1);

    // The date is corrected — the same event now fans out.
    events[0].meetingDate = new Date("2026-08-17T18:00:00.000Z");
    const fixed = await runPollerTick(opts);
    expect(fixed.futureSummaryHeld).toBe(0);
    expect(fixed.wakesEnqueued).toBe(1);
    expect(processedFor(db, "athens", "m-future", "summarize")).toBeDefined();
  });

  it("wakes for a summary of a meeting held two weeks ago", async () => {
    // Transcription and summarization take time; age alone must not suppress
    // a meeting's first and only summary.
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: [
        meetingRow("task-old-summary", {
          meetingId: "m-fortnight",
          meetingDate: new Date("2026-08-04T18:00:00.000Z"),
        }),
      ],
    });

    const result = await runPollerTick({
      db,
      main,
      bird: new FakeBird(),
      alert: async () => {},
      now,
      editorial: editorialOk,
    });

    expect(result.staleConsumed).toBe(0);
    expect(result.wakesEnqueued).toBe(1);
  });

  it("never wakes twice for the same meeting and event type", async () => {
    // The dedup identity is (cityId, meetingId, type) — never the task. A
    // re-run writes a NEW TaskStatus row, and that must not read as news.
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: [
        meetingRow("task1", { meetingId: "m-dedup" }),
        meetingRow("task1-rerun", { meetingId: "m-dedup" }),
      ],
    });
    const opts = {
      db,
      main,
      bird: new FakeBird(),
      alert: async () => {},
      now,
      editorial: editorialOk,
    };

    const first = await runPollerTick(opts);
    expect(first.wakesEnqueued).toBe(1);

    const second = await runPollerTick(opts);
    expect(second.wakesEnqueued).toBe(0);
    expect(editorialOk).toHaveBeenCalledTimes(1);
  });

  it("consumes a stale meeting's event without editorial spend or a wake", async () => {
    // completedAt is TaskStatus.updatedAt underneath: a re-run (batchRerun
    // --force) or a bulk touch of old rows makes a years-old meeting look
    // fresh. The meeting's own date is the guard — old news is recorded as
    // consumed and nobody is messaged about it.
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: [
        meetingRow("task-old", {
          meetingId: "m-old",
          meetingDate: new Date("2024-03-10T18:00:00.000Z"),
        }),
      ],
    });

    const result = await runPollerTick({
      db,
      main,
      bird: new FakeBird(),
      alert: async () => {},
      now,
      editorial: editorialOk,
    });

    expect(editorialOk).not.toHaveBeenCalled();
    expect(result.staleConsumed).toBe(1);
    expect(result.wakesEnqueued).toBe(0);
    expect(db.store.queue.size).toBe(0);
    // Recorded like seedOnly, so it stops re-surfacing every tick.
    expect(processedFor(db, "athens", "m-old", "summarize")).toBeDefined();

    const again = await runPollerTick({
      db,
      main,
      bird: new FakeBird(),
      alert: async () => {},
      now,
      editorial: editorialOk,
    });
    expect(again.staleConsumed).toBe(0);
  });

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
    expect(processedFor(db, "athens", "m1", "summarize")).toMatchObject({ briefCostUsd: 0.07 });
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

  it("dedups across ticks by meeting and phase", async () => {
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

  it("a re-processed meeting does NOT notify again, whatever its new task id", async () => {
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: [meetingRow("task1")],
    });

    await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now, editorial: editorialOk });
    expect(db.store.queue.size).toBe(1);

    // Someone re-runs the summarize task for the same meeting: a NEW
    // TaskStatus row, and release happened at creation, so it arrives
    // looking exactly like fresh news.
    const afterRerun = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: [meetingRow("task2")],
    });

    const again = await runPollerTick({
      db,
      main: afterRerun,
      bird: new FakeBird(),
      alert: async () => {},
      now,
      editorial: editorialOk,
    });

    expect(again.eventsProcessed).toBe(0);
    expect(editorialOk).toHaveBeenCalledTimes(1);
    expect(db.store.queue.size).toBe(1);
    // The record still names the run that produced it.
    expect(processedFor(db, "athens", "m1", "summarize")?.taskId).toBe("task1");
  });

  it("a meeting whose FIRST task failed still notifies when a later run succeeds", async () => {
    // Nothing was recorded for a failed task — the view only lists
    // succeeded ones — so its retry is the first success, not a repeat.
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: [meetingRow("task-retry")],
    });

    const result = await runPollerTick({
      db,
      main,
      bird: new FakeBird(),
      alert: async () => {},
      now,
      editorial: editorialOk,
    });

    expect(result.eventsProcessed).toBe(1);
    expect(result.wakesEnqueued).toBe(1);
  });

  it("an event with no audience is consumed without paying for an editorial pass", async () => {
    const db = makeFakeDb();
    const main = makeFakeMain({ events: [meetingRow("task1")] });

    const result = await runPollerTick({ db, main, bird: new FakeBird(), alert: async () => {}, now, editorial: editorialOk });

    expect(result.eventsProcessed).toBe(1);
    expect(editorialOk).not.toHaveBeenCalled();
    expect(processedFor(db, "athens", "m1", "summarize")?.brief).toBeUndefined();
  });

  it("an editorial failure alerts, records nothing, and does not starve later events", async () => {
    const db = makeFakeDb({
      subscriptions: [
        activeSub("sub1", "user1"),
        activeSub("sub2", "user2"),
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
    expect(processedFor(db, "athens", "m1", "summarize")).toBeUndefined(); // retried next tick
    expect(processedFor(db, "patras", "m2", "summarize")).toBeDefined();
    expect(result.eventsProcessed).toBe(1);
  });

  it("one reader in two cities gets ONE coalesced batch row", async () => {
    const db = makeFakeDb({
      subscriptions: [
        activeSub("sub1", "user1"),
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

  it("seedOnly consumes every disposition, data errors included, and alarms about none", async () => {
    // A row left unconsumed by the quiet start fans out to the whole cohort
    // on some later tick — the one thing seedOnly exists to prevent. The
    // future-dated summary is the case that used to survive it.
    const db = seededDb();
    const main = makeFakeMain({
      users: [{ id: "user1", name: "Μαρία", phone: "+306900000001" }],
      targets: [target("user1", "athens")],
      events: [
        meetingRow("task-future", {
          meetingId: "m-future",
          meetingDate: new Date("2026-08-20T18:00:00.000Z"),
        }),
        meetingRow("task-late-agenda", {
          type: "processAgenda",
          meetingId: "m-held",
          meetingDate: new Date("2026-08-15T18:00:00.000Z"),
        }),
        meetingRow("task-stale", {
          meetingId: "m-old",
          meetingDate: new Date("2024-03-10T18:00:00.000Z"),
        }),
        meetingRow("task-normal", { meetingId: "m-normal" }),
      ],
    });
    const alerts: string[] = [];

    const result = await runPollerTick(
      {
        db,
        main,
        bird: new FakeBird(),
        alert: async (m: string) => {
          alerts.push(m);
        },
        now,
        editorial: editorialOk,
      },
      { seedOnly: true },
    );

    expect(result.eventsProcessed).toBe(4);
    expect(result.futureSummaryHeld).toBe(0);
    expect(alerts).toHaveLength(0);
    expect(editorialOk).not.toHaveBeenCalled();
    expect(db.store.queue.size).toBe(0);
    expect(processedFor(db, "athens", "m-future", "summarize")).toBeDefined();
    expect(processedFor(db, "athens", "m-held", "processAgenda")).toBeDefined();
    expect(processedFor(db, "athens", "m-old", "summarize")).toBeDefined();
    expect(processedFor(db, "athens", "m-normal", "summarize")).toBeDefined();

    // The seeded deployment stays quiet on the next tick too.
    const again = await runPollerTick({
      db,
      main,
      bird: new FakeBird(),
      alert: async (m: string) => {
        alerts.push(m);
      },
      now,
      editorial: editorialOk,
    });
    expect(again.wakesEnqueued).toBe(0);
    expect(alerts).toHaveLength(0);
  });
});
