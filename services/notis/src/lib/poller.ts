import type { MeetingEventRow, PrismaClient as MainViewsClient } from "../../generated/main-client";
import type { Prisma, PrismaClient } from "../../generated/client";
import { normalizeMobilePhone } from "@opencouncil/ui/lib/phone";
import { editorialPass } from "@/agent/editorialPass";
import { seedProfileFromPreferences } from "@/agent/profileSeed";
import { renderTemplate } from "@/agent/templates";
import { EditorialBrief, WakeEvent } from "@/agent/types";
import { clampToActiveHours, isQuietHour } from "./active-hours";
import { alert as sendAlert } from "./alert";
import { BirdLike, realBird } from "./bird";
import { hasNotisDb, notisDb } from "./db";
import { buildDeps } from "./deps";
import { toCityPreferences } from "./fanout";
import { hasMainDb, mainDb } from "./main-db";
import { normalizePhone } from "./phone";
import { deliverPendingMessage, suppressPendingOutbound } from "./queue";
import { enqueueBatchWake, isUniqueViolation } from "./queue-core";
import {
  POLLER_STATUS_KEY,
  futureSummaryAlertKey,
  getProactiveSettings,
  hasSetting,
  putSetting,
} from "./settings";

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
  /** Flagged users not enrolled because their phone cannot receive WhatsApp,
   *  or already belongs to another active subscription. They retry every tick. */
  enrollmentHeld: number;
  phonesRefreshed: number;
  phoneGoneUnsubscribed: number;
  scheduledFired: number;
  eventsProcessed: number;
  wakesEnqueued: number;
  /** Events consumed without a wake because the meeting itself is old news. */
  staleConsumed: number;
  /** Agenda events consumed without a wake because the meeting already happened. */
  lateAgendaConsumed: number;
  /** Summarize events held back because the meeting is still dated in the future. */
  futureSummaryHeld: number;
  editorialCostUsd: number;
}

/** Editorial spend ceiling per tick (~$0.60); the backlog drains across
 *  ticks instead of one expensive burst. */
export const MAX_EVENTS_PER_TICK = 4;
/** How far back the event feed looks. completedAt moves on task-row
 *  rewrites, so this is a coarse window — dedup is by meeting and phase. */
export const EVENT_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
/**
 * A meeting older than this is never news, whatever its task rows say.
 * completedAt is TaskStatus.updatedAt underneath: a re-run (batchRerun
 * --force writes NEW succeeded rows) or any client-side touch of old rows
 * re-enters them into the lookback, and the meeting-identity dedup only
 * protects meetings notis has already recorded — pre-launch history is not.
 * Without this guard one maintenance script would pay an editorial pass per
 * old meeting and WhatsApp whole cohorts about years-old news.
 */
export const STALE_MEETING_MS = 30 * 24 * 60 * 60_000;
/** Budget for the meeting fan-out transaction, which grows with the audience.
 *  Well above the queue's 30s persist budget because this one loops over every
 *  subscriber of a meeting; see the call site in processMeetingEvents. */
const FANOUT_TIMEOUT_MS = 120_000;

const emptyResult = (ran: boolean, reason?: string): PollerResult => ({
  ran,
  ...(reason ? { reason } : {}),
  enrolled: 0,
  introsSent: 0,
  enrollmentHeld: 0,
  phonesRefreshed: 0,
  phoneGoneUnsubscribed: 0,
  scheduledFired: 0,
  eventsProcessed: 0,
  wakesEnqueued: 0,
  staleConsumed: 0,
  lateAgendaConsumed: 0,
  futureSummaryHeld: 0,
  editorialCostUsd: 0,
});

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
  await fireScheduledWakes(db, main, now, rng, result);
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
 * demos_transition intro.
 *
 * Three conditions gate the phase, and all three exist to keep enrollment
 * and its intro inseparable — a subscription is skipped forever once it
 * exists, so a ceremony that commits without delivering leaves that reader
 * permanently silent:
 * - paused: enrolling without the intro recreates the silent-cohort
 *   problem, so flipping a user in the release panel takes effect once the
 *   switch is on;
 * - quiet hours: the intro is a cold proactive template like any other and
 *   is held to the 09:00 release rather than sent at 01:00;
 * - an unaddressable template: without its Bird project id every intro
 *   fails non-retryably, so the whole cohort would enroll into silence.
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
  if (isQuietHour(now())) return;

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
  if (byUser.size === 0) return;

  // Checked with a cohort in hand, not every tick: alerting on an idle
  // misconfiguration would page every five minutes forever.
  if (!bird.canSendTemplate("demos_transition")) {
    await alert(
      `enrollment held: ${byUser.size} user(s) are ready but the demos_transition template has no Bird project id — enrolling them now would leave them permanently without an intro`,
    );
    return;
  }

  const rendered = renderTemplate("demos_transition");
  const held: string[] = [];
  for (const [userId, rows] of byUser) {
    const raw = normalizePhone(rows[0].phone);
    if (!raw) continue;
    // The last gate before a number that reaches nobody becomes a
    // subscription that can never be re-enrolled. The main app applies the
    // same rule on every write; held users retry every tick, so a repair
    // there takes effect here on its own.
    const parsed = normalizeMobilePhone(raw);
    if (!parsed.ok) {
      held.push(`${userId} (${parsed.reason})`);
      continue;
    }
    const phone = parsed.e164;
    const holder = await db.notisSubscription.findFirst({
      where: { phone, status: "active", NOT: { userId } },
      select: { userId: true },
    });
    if (holder) {
      held.push(`${userId} (phone already on ${holder.userId})`);
      continue;
    }
    const cities = toCityPreferences(rows);
    const at = now();

    // A plain create, not an upsert: the unique userId is what makes the
    // ceremony run exactly once. Two ticks (a second instance, or the CLI
    // beside the interval) can both pass the `existing` pre-read, and an
    // upsert would absorb the conflict and let the loser send a
    // SECOND intro. The loser's transaction now rolls back whole.
    let enrollment: { subId: string; introId: string };
    try {
      enrollment = await db.$transaction(async (tx) => {
      const sub = await tx.notisSubscription.create({
        data: {
          userId,
          phone,
          status: "active",
          origin: "transition",
          profileText: seedProfileFromPreferences(cities),
          userName: rows[0].userName,
        },
        select: { id: true },
      });
      // No decision row: the intro's text reaches the agent through the
      // conversation (its message row, once sent), and the panel's intro
      // bubble renders from the subscription's origin.
      const intro = await tx.notisMessage.create({
        data: {
          subscriptionId: sub.id,
          direction: "outbound",
          body: rendered.body,
          channel: "whatsapp",
          proactive: true,
          railed: true,
          deliveryMode: "template",
          template: "demos_transition",
          status: "pending",
        },
        select: { id: true },
      });
      return { subId: sub.id, introId: intro.id };
      });
    } catch (error) {
      // Another tick enrolled this user first; it owns the intro.
      if (isUniqueViolation(error)) continue;
      throw error;
    }

    result.enrolled++;
    const sub = await db.notisSubscription.findUnique({ where: { id: enrollment.subId } });
    if (sub) {
      await deliverPendingMessage(db, bird, enrollment.introId, sub, alert);
      result.introsSent++;
    }
  }

  result.enrollmentHeld = held.length;
  // A held user stays held until someone fixes the number, and the poller
  // ticks every five minutes — so each one is reported once per process,
  // not every tick.
  const fresh = held.filter((entry) => !heldAlerted.has(entry));
  if (fresh.length > 0) {
    for (const entry of fresh) heldAlerted.add(entry);
    await alert(
      `enrollment held for ${fresh.length} flagged user(s) whose phone cannot receive WhatsApp — fix it in the main app and the next tick enrolls them: ${fresh.join(", ")}`,
    );
  }
}

/** Held-enrollment entries already reported, for the life of the process. */
const heldAlerted = new Set<string>();

/**
 * Phase (b) — reconciliation for existing subscriptions: refresh phone and
 * name (write only on change — updatedAt is the conversation list's sort
 * key), and unsubscribe when the phone is GONE,
 * with a model-less wake row naming the reason. Never re-activates.
 */
async function reconcileSubscriptions(
  db: PrismaClient,
  main: MainViewsClient,
  now: () => Date,
  result: PollerResult,
): Promise<void> {
  const subs = await db.notisSubscription.findMany({
    select: { id: true, userId: true, phone: true, status: true, userName: true },
  });
  if (subs.length === 0) return;
  const userIds = subs.map((s) => s.userId);

  const users = await main.notisUserRow.findMany({ where: { id: { in: userIds } } });
  const userById = new Map(users.map((u) => [u.id, u]));

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
          // The third unsubscribe site gets the same cleanup as the other
          // two: nothing queued may outlive the opt-out. sendFreeform needs
          // only birdConversationId (which survives), so without this the
          // sweeper would deliver a leftover pending row after the phone
          // was removed.
          await suppressPendingOutbound(tx, sub.id);
          await tx.notisCommitment.updateMany({
            where: { subscriptionId: sub.id, resolvedAt: null },
            data: { resolvedAt: at },
          });
          // A model-less wake row: why this reader went silent must survive in
          // the decision log (the audit answer to "who unsubscribed them").
          const rationale =
            "(σύστημα) Ο αριθμός τηλεφώνου αφαιρέθηκε από τον λογαριασμό — απεγγραφή. Επανεγγραφή μόνο με ρητή ενέργεια του χρήστη.";
          await tx.notisWake.create({
            data: {
              subscriptionId: sub.id,
              eventType: "system",
              eventAt: at,
              event: { type: "system", at: at.toISOString() } as unknown as Prisma.InputJsonValue,
              decision: "silence",
              rationale,
              outcome: {
                decision: "silence",
                rationale,
                messages: [],
                scheduledWakes: [],
                unsubscribe: { reason: "phone removed" },
              } as unknown as Prisma.InputJsonValue,
              costUsd: 0,
              durationMs: 0,
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
 *
 * A note is also consumed without a wake when the reader was rolled back in
 * the release panel (notisEnabledAt cleared): the old notification path serves
 * them again, so a proactive send here would double-serve. The poller never
 * removes or resurrects the subscription, so this is the only place the
 * scheduled leg learns of a rollback — the fan-out audience query and the
 * inbound webhook already honor it. Fail open when the main DB is unreachable,
 * matching the inbound webhook's stance.
 */
async function fireScheduledWakes(
  db: PrismaClient,
  main: MainViewsClient | null,
  now: () => Date,
  rng: () => number,
  result: PollerResult,
): Promise<void> {
  const due = await db.notisScheduledWake.findMany({
    where: { firedAt: null, runAfter: { lte: now() } },
    take: 100,
  });
  if (due.length === 0) return;

  const subs = await db.notisSubscription.findMany({
    where: { id: { in: [...new Set(due.map((n) => n.subscriptionId))] } },
    select: { id: true, userId: true, status: true },
  });
  const subById = new Map(subs.map((s) => [s.id, s]));

  // Which of these readers still carry the rollout flag. Null means the main
  // DB is unreachable this tick — fail open (fire the notes) rather than hold
  // promised follow-ups hostage to a transient outage.
  let enabledUserIds: Set<string> | null = null;
  if (main) {
    const rows = await main.notisUserRow.findMany({
      where: { id: { in: [...new Set(subs.map((s) => s.userId))] }, notisEnabledAt: { not: null } },
      select: { id: true },
    });
    enabledUserIds = new Set(rows.map((r) => r.id));
  }

  for (const note of due) {
    const sub = subById.get(note.subscriptionId);
    const clamped = clampToActiveHours(now(), rng);
    await db.$transaction(async (tx) => {
      const fenced = await tx.notisScheduledWake.updateMany({
        where: { id: note.id, firedAt: null },
        data: { firedAt: now() },
      });
      if (fenced.count !== 1) return;
      if (!sub || sub.status === "unsubscribed") return;
      if (enabledUserIds && !enabledUserIds.has(sub.userId)) return;
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
 * What the poller does with one meeting event, decided by its type and the
 * MEETING's own date — never by when the task finished. The table:
 *
 * | event          | meeting ahead | meeting past      |
 * |----------------|---------------|-------------------|
 * | processAgenda  | fanout        | late-agenda       |
 * | summarize      | future-summary| fanout            |
 *
 * `stale` overrides both for a meeting older than STALE_MEETING_MS. That is
 * a blast-radius floor, not part of the semantics above: completedAt is
 * TaskStatus.updatedAt, so one `batchRerun --force` over the archive would
 * otherwise pay an editorial pass per meeting and WhatsApp whole cohorts
 * about years-old news. Dedup does not cover it — a meeting notis never
 * recorded (pre-launch history) has no processed row to match.
 *
 * - `late-agenda`: a processAgenda task that succeeded after the meeting was
 *   held (a late upload, a backfill, batchRerun --force). Fanning it out
 *   would preview a meeting that already happened, against an archive that
 *   by then carries the transcript. The summarize event is that meeting's
 *   real news and arrives on its own.
 * - `future-summary`: a meeting cannot be summarized before it happens, so
 *   this is a data error — almost always a wrong CouncilMeeting.dateTime.
 *   The poller alarms and sends nothing. Unlike the other two it is NOT
 *   consumed, so correcting the date lets the same event fan out — but only
 *   while the task row is still inside EVENT_LOOKBACK_MS. completedAt is
 *   TaskStatus.updatedAt and does not move when CouncilMeeting.dateTime is
 *   fixed, so a later fix needs the summarize task re-run. The alarm says so.
 */
export type EventDisposition = "fanout" | "stale" | "late-agenda" | "future-summary";

export function classifyEvent(
  row: Pick<MeetingEventRow, "type" | "meetingDate">,
  at: Date,
  staleBefore: Date,
): EventDisposition {
  if (row.meetingDate < staleBefore) return "stale";
  const ahead = row.meetingDate > at;
  if (row.type === "processAgenda") return ahead ? "fanout" : "late-agenda";
  return ahead ? "future-summary" : "fanout";
}

/**
 * Record an event as consumed without a wake — the same row seedOnly writes,
 * with no brief and no fan-out. Returns false when a concurrent tick got
 * there first.
 */
async function consumeEvent(db: PrismaClient, row: MeetingEventRow): Promise<boolean> {
  try {
    await db.notisProcessedEvent.create({
      data: {
        taskId: row.taskId,
        type: row.type,
        cityId: row.cityId,
        meetingId: row.meetingId,
        meetingName: row.meetingName,
        meetingDate: row.meetingDate,
        adminBodyName: row.adminBodyName,
      },
    });
    return true;
  } catch {
    // Raced by a concurrent tick — already recorded.
    return false;
  }
}

/**
 * Phase (d) — meeting events: only released meetings (the public MCP gates
 * on released, so an early wake cannot ground; unreleased events are NOT
 * recorded, and a later release fires naturally). Dedup by (cityId,
 * meetingId, type), so a re-processed meeting is not fresh news — a failed
 * task recorded nothing, so its retry still fires.
 * One editorial pass per event, shared by every subscriber; the
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

  // Dedup on the MEETING and its phase, never on the task. Re-processing a
  // meeting writes a new TaskStatus row, so a taskId key would read a re-run
  // as news and send the same agenda or the same summary twice — and the
  // tool that re-runs tasks works on lists of them.
  const identity = (row: { cityId: string; meetingId: string; type: string }) =>
    `${row.cityId}\u0000${row.meetingId}\u0000${row.type}`;
  const processed = await db.notisProcessedEvent.findMany({
    where: {
      OR: candidates.map((c) => ({
        cityId: c.cityId,
        meetingId: c.meetingId,
        type: c.type,
      })),
    },
    select: { cityId: true, meetingId: true, type: true },
  });
  const processedIds = new Set(processed.map(identity));
  // Collapse duplicates WITHIN the tick too. A re-run leaves two succeeded
  // task rows for the same meeting and phase, and both land in one lookback
  // window. The processed row only exists after the first one commits, so
  // without this the second pays a full editorial pass and then throws it
  // away on the unique violation — and burns a MAX_EVENTS_PER_TICK slot
  // doing it. Candidates arrive ordered completedAt asc, so the first wins.
  const byIdentity = new Map<string, MeetingEventRow>();
  for (const c of candidates) {
    const id = identity(c);
    if (!processedIds.has(id) && !byIdentity.has(id)) byIdentity.set(id, c);
  }
  const unprocessed = [...byIdentity.values()];

  if (opts.seedOnly) {
    // Quiet start: mark the whole backlog consumed, wake nobody, alarm about
    // nothing. Every disposition is the same here, data errors included — a
    // seeded deployment must not act on anything it finds, and a row left
    // unconsumed would fan out to the whole cohort on some later tick.
    for (const row of unprocessed) {
      if (await consumeEvent(db, row)) result.eventsProcessed++;
    }
    return;
  }

  // Sort every unprocessed event by classifyEvent's table, then act on each
  // bucket. Consuming records the row the same way seedOnly does, so it stops
  // re-surfacing every tick, with no editorial pass and nothing enqueued.
  const staleBefore = new Date(now().getTime() - STALE_MEETING_MS);
  const at = now();
  const byDisposition = new Map<EventDisposition, MeetingEventRow[]>();
  for (const row of unprocessed) {
    const disposition = classifyEvent(row, at, staleBefore);
    byDisposition.set(disposition, [...(byDisposition.get(disposition) ?? []), row]);
  }

  for (const row of byDisposition.get("stale") ?? []) {
    if (await consumeEvent(db, row)) result.staleConsumed++;
  }
  for (const row of byDisposition.get("late-agenda") ?? []) {
    if (await consumeEvent(db, row)) result.lateAgendaConsumed++;
  }
  // Deliberately NOT consumed — see classifyEvent. The settings key holds the
  // alarm to once per meeting instead of once per five-minute tick, so the
  // alarm has to carry the whole remedy: it is the only one ops gets.
  for (const row of byDisposition.get("future-summary") ?? []) {
    result.futureSummaryHeld++;
    const key = futureSummaryAlertKey(row.cityId, row.meetingId);
    if (await hasSetting(db, key)) continue;
    await alert(
      `summarize completed for ${row.cityId}/${row.meetingId} (${row.taskId}) but the meeting is dated ${row.meetingDate.toISOString()}, in the future — nobody was woken. ` +
        `Fix CouncilMeeting.dateTime. Do it within ${EVENT_LOOKBACK_MS / 86_400_000} days of the task completing and the next tick fans the event out by itself; after that the row leaves the event feed, so re-run the summarize task to bring it back.`,
    );
    await putSetting(db, key, { at: at.toISOString(), taskId: row.taskId });
  }

  const fresh = byDisposition.get("fanout") ?? [];
  if (fresh.length === 0) return;

  const subs = await db.notisSubscription.findMany({
    where: { status: "active" },
    select: { id: true, userId: true },
  });

  const upcoming = fresh.slice(0, MAX_EVENTS_PER_TICK);
  // The audience comes straight from the live view: dropping a city from
  // your preferences (or losing the rollout flag) takes effect this tick.
  const cityTargets = await main.fanoutTargetRow.findMany({
    where: {
      cityId: { in: [...new Set(upcoming.map((r) => r.cityId))] },
      notisEnabledAt: { not: null },
    },
  });
  const usersByCity = new Map<string, Set<string>>();
  for (const t of cityTargets) {
    const set = usersByCity.get(t.cityId) ?? new Set<string>();
    set.add(t.userId);
    usersByCity.set(t.cityId, set);
  }

  for (const row of upcoming) {
    const wanted = usersByCity.get(row.cityId);
    const audience = subs.filter((sub) => wanted?.has(sub.userId));
    const phase = row.type === "processAgenda" ? "agenda" : "summary";

    // Nobody to wake: record the event as consumed without paying for an
    // editorial pass. A subscriber arriving later gets the NEXT event.
    if (audience.length === 0) {
      if (await consumeEvent(db, row)) result.eventsProcessed++;
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
      // This transaction scales with the audience: one processed-event row plus
      // one enqueueBatchWake per subscriber, each a few round trips. Prisma's
      // default 5s budget rolls back at a few hundred subscribers, and because
      // the paid editorial pass ran above (before the transaction), a rollback
      // makes the next tick re-run it and time out again — a permanent loop. A
      // generous budget holds it for a large audience; a set-based enqueue for
      // the whole audience is the real fix when a single city grows past that.
      await db.$transaction(
        async (tx) => {
          await tx.notisProcessedEvent.create({
            data: {
              taskId: row.taskId,
              type: row.type,
              cityId: row.cityId,
              meetingId: row.meetingId,
              meetingName: row.meetingName,
              meetingDate: row.meetingDate,
              adminBodyName: row.adminBodyName,
              brief: brief as unknown as Prisma.InputJsonValue,
              briefCostUsd: costUsd,
            },
          });
          for (const sub of audience) {
            await enqueueBatchWake(tx, { subscriptionId: sub.id, event, runAfter });
            result.wakesEnqueued++;
          }
        },
        { timeout: FANOUT_TIMEOUT_MS, maxWait: 10_000 },
      );
      result.eventsProcessed++;
      result.editorialCostUsd += costUsd;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2002") continue; // raced by a concurrent tick
      throw error;
    }
  }
}
