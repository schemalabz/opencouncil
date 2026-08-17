import type { PrismaClient as MainViewsClient } from "../../generated/main-client";
import type { NotisSubscription, Prisma, PrismaClient } from "../../generated/client";
import { editorialPass } from "@/agent/editorialPass";
import { seedProfileFromPreferences } from "@/agent/profileSeed";
import { renderTemplate } from "@/agent/templates";
import { CityPreference, EditorialBrief, WakeEvent } from "@/agent/types";
import { clampToActiveHours } from "./active-hours";
import { alert as sendAlert } from "./alert";
import { BirdLike, realBird } from "./bird";
import { hasNotisDb, notisDb } from "./db";
import { buildDeps } from "./deps";
import { toCityPreferences } from "./fanout";
import { hasMainDb, mainDb } from "./main-db";
import { normalizePhone } from "./phone";
import { deliverPendingMessage, suppressMessages } from "./queue";
import { enqueueBatchWake } from "./queue-core";
import { POLLER_STATUS_KEY, getProactiveSettings, putSetting } from "./settings";

/**
 * The five-minute poller — every link between OpenCouncil and notis is a
 * pull from here (PRD §4): enrollments, subscription reconciliation,
 * scheduled-wake firing, and meeting-event fan-out. OpenCouncil's runtime
 * never calls notis; an hour of downtime just means catching up on the
 * next tick.
 *
 * Ownership (schema.prisma): notis owns subscription state. This code
 * refreshes phones and unsubscribes when a phone is GONE; it never
 * re-activates anyone, and notifyByPhone is an enrollment-time filter only.
 *
 * Greece-only launch: the Athens quiet-hours clamp is hardcoded. When a
 * second realm ships, timezone (and the MCP origin) come from the meeting
 * and subscription rows — both views already carry them.
 */

export interface PollerDeps {
  db?: PrismaClient;
  main?: MainViewsClient;
  bird?: BirdLike;
  alert?: (message: string) => Promise<void>;
  now?: () => Date;
  rng?: () => number;
  editorial?: (
    cityId: string,
    meetingId: string,
    phase: "agenda" | "summary",
  ) => Promise<{ brief: EditorialBrief; costUsd: number }>;
}

export interface PollerResult {
  ran: boolean;
  reason?: string;
  enrolled: number;
  introsSent: number;
  phonesRefreshed: number;
  phoneGoneUnsubscribed: number;
  citiesRefreshed: number;
  scheduledFired: number;
  eventsProcessed: number;
  wakesEnqueued: number;
  editorialCostUsd: number;
}

/** Editorial spend ceiling per tick (~$0.60); the backlog drains across
 *  ticks instead of one expensive burst. */
export const MAX_EVENTS_PER_TICK = 4;
/** How far back the event feed looks. completedAt moves on task-row
 *  rewrites, so this is a coarse window — dedup is strictly by taskId. */
export const EVENT_LOOKBACK_MS = 7 * 24 * 60 * 60_000;

const emptyResult = (ran: boolean, reason?: string): PollerResult => ({
  ran,
  ...(reason ? { reason } : {}),
  enrolled: 0,
  introsSent: 0,
  phonesRefreshed: 0,
  phoneGoneUnsubscribed: 0,
  citiesRefreshed: 0,
  scheduledFired: 0,
  eventsProcessed: 0,
  wakesEnqueued: 0,
  editorialCostUsd: 0,
});

function subscriptionCities(sub: Pick<NotisSubscription, "cities">): CityPreference[] {
  return Array.isArray(sub.cities) ? (sub.cities as unknown as CityPreference[]) : [];
}

async function nextJournalSeq(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
): Promise<number> {
  const { _max } = await tx.notisJournalEntry.aggregate({
    where: { subscriptionId },
    _max: { seq: true },
  });
  return (_max.seq ?? 0) + 1;
}

/** One poller run is in flight at a time per process; a tick that lands
 *  while another runs is skipped, not queued. */
let ticking = false;

export async function runPollerTick(
  overrides: PollerDeps = {},
  opts: { seedOnly?: boolean } = {},
): Promise<PollerResult> {
  if (!overrides.db && !hasNotisDb()) return emptyResult(false, "no notis database");
  if (ticking) return emptyResult(false, "previous tick still running");
  ticking = true;
  try {
    return await tick(overrides, opts);
  } finally {
    ticking = false;
  }
}

async function tick(
  overrides: PollerDeps,
  opts: { seedOnly?: boolean },
): Promise<PollerResult> {
  const db = overrides.db ?? notisDb();
  const main = overrides.main ?? (hasMainDb() ? mainDb() : null);
  const bird = overrides.bird ?? realBird;
  const alert = overrides.alert ?? ((m: string) => sendAlert("poller", m, "📡"));
  const now = overrides.now ?? (() => new Date());
  const rng = overrides.rng ?? Math.random;
  const editorial =
    overrides.editorial ??
    (async (cityId: string, meetingId: string, phase: "agenda" | "summary") => {
      const { brief, costUsd } = await editorialPass(cityId, meetingId, buildDeps(), phase);
      return { brief, costUsd };
    });

  const result = emptyResult(true);

  if (main) {
    await enrollNewTargets(db, main, bird, alert, now, result);
    await reconcileSubscriptions(db, main, now, result);
  }
  await fireScheduledWakes(db, now, rng, result);
  if (main) {
    await processMeetingEvents(db, main, alert, now, rng, editorial, opts, result);
  }

  await putSetting(db, POLLER_STATUS_KEY, {
    at: now().toISOString(),
    ...(({ ran: _ran, reason: _reason, ...counts }) => counts)(result),
  });
  return result;
}

/**
 * Phase (a) — enrollment ceremony. A rollout-enabled user with phone
 * delivery on and no subscription (any status — never resurrect) gets one:
 * profile seeded from preferences, origin `transition`, and the
 * demos_transition intro. Shadow mode records the intro suppressed and
 * calls nobody; a paused system skips the phase entirely — enrolling
 * without the intro would recreate the silent-cohort problem.
 */
async function enrollNewTargets(
  db: PrismaClient,
  main: MainViewsClient,
  bird: BirdLike,
  alert: (message: string) => Promise<void>,
  now: () => Date,
  result: PollerResult,
): Promise<void> {
  const settings = await getProactiveSettings(db);
  if (settings.paused) return;

  const targets = await main.fanoutTargetRow.findMany({
    where: { notisEnabledAt: { not: null }, notifyByPhone: true, phone: { not: null } },
    orderBy: [{ userId: "asc" }, { cityId: "asc" }],
  });
  if (targets.length === 0) return;

  const byUser = new Map<string, typeof targets>();
  for (const row of targets) {
    const rows = byUser.get(row.userId) ?? [];
    rows.push(row);
    byUser.set(row.userId, rows);
  }

  const existing = await db.notisSubscription.findMany({
    where: { userId: { in: [...byUser.keys()] } },
    select: { userId: true },
  });
  for (const sub of existing) byUser.delete(sub.userId);

  const rendered = renderTemplate("demos_transition");
  for (const [userId, rows] of byUser) {
    const phone = normalizePhone(rows[0].phone);
    if (!phone) continue;
    const cities = toCityPreferences(rows);
    const at = now();

    const { subId, introId } = await db.$transaction(async (tx) => {
      const sub = await tx.notisSubscription.upsert({
        where: { userId },
        create: {
          userId,
          phone,
          status: "active",
          origin: "transition",
          profileText: seedProfileFromPreferences(cities),
          cities: cities as unknown as Prisma.InputJsonValue,
          userName: rows[0].userName,
        },
        update: {},
        select: { id: true },
      });
      await tx.notisJournalEntry.create({
        data: {
          subscriptionId: sub.id,
          seq: await nextJournalSeq(tx, sub.id),
          entry: {
            at: at.toISOString(),
            event: "enrollment",
            decision: "send",
            rationale:
              settings.mode === "live"
                ? "(σύστημα) Εγγραφή μέσω μετάβασης από τις παλιές ειδοποιήσεις — στάλθηκε το εγκεκριμένο template demos_transition."
                : "(σύστημα) Εγγραφή μέσω μετάβασης από τις παλιές ειδοποιήσεις — το template demos_transition ΔΕΝ στάλθηκε (shadow mode).",
            messages: [rendered.body],
          } as Prisma.InputJsonValue,
        },
      });
      const intro = await tx.notisMessage.create({
        data: {
          subscriptionId: sub.id,
          direction: "outbound",
          body: rendered.body,
          channel: "whatsapp",
          proactive: true,
          deliveryMode: "template",
          template: "demos_transition",
          status: "pending",
        },
        select: { id: true },
      });
      return { subId: sub.id, introId: intro.id };
    });

    result.enrolled++;
    if (settings.mode === "live") {
      const sub = await db.notisSubscription.findUnique({ where: { id: subId } });
      if (sub) {
        await deliverPendingMessage(db, bird, introId, sub, alert);
        result.introsSent++;
      }
    } else {
      await suppressMessages(db, [introId], "shadow mode");
    }
  }
}

/**
 * Phase (b) — reconciliation for existing subscriptions: refresh phone,
 * name and the cities snapshot (write only on change — updatedAt is the
 * conversation list's sort key), and unsubscribe when the phone is GONE,
 * with a journal entry naming the reason. Never re-activates.
 */
async function reconcileSubscriptions(
  db: PrismaClient,
  main: MainViewsClient,
  now: () => Date,
  result: PollerResult,
): Promise<void> {
  const subs = await db.notisSubscription.findMany({
    select: { id: true, userId: true, phone: true, status: true, cities: true, userName: true },
  });
  if (subs.length === 0) return;
  const userIds = subs.map((s) => s.userId);

  const [users, targets] = await Promise.all([
    main.notisUserRow.findMany({ where: { id: { in: userIds } } }),
    main.fanoutTargetRow.findMany({
      where: { userId: { in: userIds } },
      orderBy: [{ userId: "asc" }, { cityId: "asc" }],
    }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const targetsByUser = new Map<string, typeof targets>();
  for (const row of targets) {
    const rows = targetsByUser.get(row.userId) ?? [];
    rows.push(row);
    targetsByUser.set(row.userId, rows);
  }

  for (const sub of subs) {
    const user = userById.get(sub.userId);
    // A missing user row is account deletion — the janitor's domain, with
    // its blast-radius guard. Not ours.
    if (!user) continue;

    const newPhone = normalizePhone(user.phone);
    if (!newPhone) {
      if (sub.status === "active") {
        const at = now();
        await db.$transaction(async (tx) => {
          await tx.notisSubscription.update({
            where: { id: sub.id },
            data: { status: "unsubscribed", unsubscribedAt: at, phone: null },
          });
          await tx.notisJournalEntry.create({
            data: {
              subscriptionId: sub.id,
              seq: await nextJournalSeq(tx, sub.id),
              entry: {
                at: at.toISOString(),
                event: "system",
                decision: "silence",
                rationale:
                  "(σύστημα) Ο αριθμός τηλεφώνου αφαιρέθηκε από τον λογαριασμό — απεγγραφή. Επανεγγραφή μόνο με ρητή ενέργεια του χρήστη.",
                messages: [],
              } as Prisma.InputJsonValue,
            },
          });
        });
        result.phoneGoneUnsubscribed++;
      }
      continue;
    }

    const data: Prisma.NotisSubscriptionUpdateInput = {};
    if (newPhone !== sub.phone) data.phone = newPhone;
    if (user.name && user.name !== sub.userName) data.userName = user.name;
    const newCities = toCityPreferences(targetsByUser.get(sub.userId) ?? []);
    if (JSON.stringify(newCities) !== JSON.stringify(subscriptionCities(sub))) {
      data.cities = newCities as unknown as Prisma.InputJsonValue;
      result.citiesRefreshed++;
    }
    if (Object.keys(data).length === 0) continue;
    if (data.phone) result.phonesRefreshed++;
    await db.notisSubscription.update({ where: { id: sub.id }, data });
  }
}

/**
 * Phase (c) — fire due scheduled wakes: fenced on firedAt so overlapping
 * ticks fire each note once, quiet-clamped so a 02:00 note lands after
 * 09:00, and enqueued on the batch lane where it coalesces with any
 * meeting events of the same morning. Notes of unsubscribed readers are
 * consumed without a wake — ΣΤΟΠ said stop.
 */
async function fireScheduledWakes(
  db: PrismaClient,
  now: () => Date,
  rng: () => number,
  result: PollerResult,
): Promise<void> {
  const due = await db.notisScheduledWake.findMany({
    where: { firedAt: null, runAfter: { lte: now() } },
    take: 100,
  });

  for (const note of due) {
    const sub = await db.notisSubscription.findUnique({
      where: { id: note.subscriptionId },
      select: { status: true },
    });
    const clamped = clampToActiveHours(now(), rng);
    await db.$transaction(async (tx) => {
      const fenced = await tx.notisScheduledWake.updateMany({
        where: { id: note.id, firedAt: null },
        data: { firedAt: now() },
      });
      if (fenced.count !== 1) return;
      if (!sub || sub.status === "unsubscribed") return;
      const event: WakeEvent = {
        type: "scheduled",
        at: clamped.toISOString(),
        reason: note.reason,
        origin: note.origin,
      };
      await enqueueBatchWake(tx, {
        subscriptionId: note.subscriptionId,
        event,
        runAfter: clamped,
      });
      result.scheduledFired++;
    });
  }
}

/**
 * Phase (d) — meeting events: only released meetings (the public MCP gates
 * on released, so an early wake cannot ground; unreleased taskIds are NOT
 * recorded, and a later release fires naturally). Dedup strictly by
 * taskId. One editorial pass per event, shared by every subscriber; the
 * processed row and all fan-out queue rows commit in one transaction, so
 * dedup-vs-fanout is crash-consistent.
 */
async function processMeetingEvents(
  db: PrismaClient,
  main: MainViewsClient,
  alert: (message: string) => Promise<void>,
  now: () => Date,
  rng: () => number,
  editorial: NonNullable<PollerDeps["editorial"]>,
  opts: { seedOnly?: boolean },
  result: PollerResult,
): Promise<void> {
  const candidates = await main.meetingEventRow.findMany({
    where: {
      released: true,
      completedAt: { gte: new Date(now().getTime() - EVENT_LOOKBACK_MS) },
    },
    orderBy: { completedAt: "asc" },
  });
  if (candidates.length === 0) return;

  const processed = await db.notisProcessedEvent.findMany({
    where: { taskId: { in: candidates.map((c) => c.taskId) } },
    select: { taskId: true },
  });
  const processedIds = new Set(processed.map((p) => p.taskId));
  const fresh = candidates.filter((c) => !processedIds.has(c.taskId));
  if (fresh.length === 0) return;

  if (opts.seedOnly) {
    // Quiet start: mark the whole backlog consumed, wake nobody.
    for (const row of fresh) {
      try {
        await db.notisProcessedEvent.create({
          data: { taskId: row.taskId, type: row.type, cityId: row.cityId, meetingId: row.meetingId },
        });
        result.eventsProcessed++;
      } catch {
        // Raced by a concurrent tick — already recorded.
      }
    }
    return;
  }

  const subs = await db.notisSubscription.findMany({
    where: { status: "active" },
    select: { id: true, cities: true },
  });

  for (const row of fresh.slice(0, MAX_EVENTS_PER_TICK)) {
    const audience = subs.filter((sub) =>
      subscriptionCities(sub).some((c) => c.cityId === row.cityId),
    );
    const phase = row.type === "processAgenda" ? "agenda" : "summary";

    // Nobody to wake: record the event as consumed without paying for an
    // editorial pass. A subscriber arriving later gets the NEXT event.
    if (audience.length === 0) {
      try {
        await db.notisProcessedEvent.create({
          data: { taskId: row.taskId, type: row.type, cityId: row.cityId, meetingId: row.meetingId },
        });
        result.eventsProcessed++;
      } catch {
        /* raced — already recorded */
      }
      continue;
    }

    let brief: EditorialBrief;
    let costUsd: number;
    try {
      ({ brief, costUsd } = await editorial(row.cityId, row.meetingId, phase));
    } catch (error) {
      // No processed row: the next tick retries. The loop continues so one
      // poison meeting cannot starve the feed.
      await alert(
        `editorial pass failed for ${row.cityId}/${row.meetingId} (${row.taskId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }

    const event: WakeEvent = {
      type: phase === "agenda" ? "agenda_processed" : "meeting_summarized",
      at: row.completedAt.toISOString(),
      cityId: row.cityId,
      meetingId: row.meetingId,
      meetingName: row.meetingName,
      meetingDate: row.meetingDate.toISOString(),
      adminBody: row.adminBodyName,
      brief,
    };
    const runAfter = clampToActiveHours(now(), rng);

    try {
      await db.$transaction(async (tx) => {
        await tx.notisProcessedEvent.create({
          data: {
            taskId: row.taskId,
            type: row.type,
            cityId: row.cityId,
            meetingId: row.meetingId,
            brief: brief as unknown as Prisma.InputJsonValue,
            briefCostUsd: costUsd,
          },
        });
        for (const sub of audience) {
          await enqueueBatchWake(tx, { subscriptionId: sub.id, event, runAfter });
          result.wakesEnqueued++;
        }
      });
      result.eventsProcessed++;
      result.editorialCostUsd += costUsd;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2002") continue; // raced by a concurrent tick
      throw error;
    }
  }
}
