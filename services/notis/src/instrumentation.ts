// This file must exist even when empty of real work: without it, Next's
// instrumentation discovery (which searches the Turbopack workspace root's
// src/ as well) picks up the MAIN app's src/instrumentation.ts and tries to
// bundle its Prisma/cache imports into Notis.
/** How long a new reader waits for their intro, at worst. See the poller below. */
export const POLLER_INTERVAL_MS = 2 * 60_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // The daily reconciliation janitor. runJanitor() no-ops (ran:false) when
  // the database URLs are not configured, so this is safe in playground-only
  // deployments. Imported lazily: the edge bundle must not see Prisma.
  const { runJanitor } = await import("./lib/janitor");
  const DAY_MS = 24 * 60 * 60 * 1000;
  const janitorTick = () => {
    runJanitor().catch((e) => console.error("[notis:janitor] run failed:", e));
  };
  setTimeout(janitorTick, 60_000);
  setInterval(janitorTick, DAY_MS);

  // The queue sweeper: crash recovery for the live lane. The webhook kicks
  // the drainer directly on every inbound, so this only picks up stale
  // claims, retries, and sends interrupted between commit and Bird call.
  // Both halves no-op without NOTIS_DATABASE_URL; overlap with a webhook
  // kick is safe (FOR UPDATE SKIP LOCKED).
  const { drainQueue, resendStalePendingMessages } = await import("./lib/queue");
  const sweep = () => {
    drainQueue().catch((e) => console.error("[notis:queue] sweep failed:", e));
    resendStalePendingMessages().catch((e) =>
      console.error("[notis:queue] resend sweep failed:", e),
    );
  };
  setInterval(sweep, 60_000);

  // The poller: enrollments, reconciliation, scheduled fires and
  // meeting-event fan-out. No-ops without NOTIS_DATABASE_URL; the main-DB
  // phases no-op without MAIN_DATABASE_URL. Re-entrancy is guarded inside
  // runPollerTick, which skips a tick that lands while one is running
  // rather than queueing it.
  //
  // Two minutes, not five: enrollment happens here and nowhere else, so this
  // interval is what a reader waits between finishing the signup and their
  // first message. The per-tick ceilings are therefore rates — at two
  // minutes MAX_ENROLLMENTS_PER_TICK releases two and a half times the
  // readers per hour that it did at five, which is the point, and it stays
  // paced rather than sending a whole launch cohort at once.
  const { runPollerTick } = await import("./lib/poller");
  const pollerTick = () => {
    runPollerTick().catch((e) => console.error("[notis:poller] tick failed:", e));
  };
  setTimeout(pollerTick, 30_000);
  setInterval(pollerTick, POLLER_INTERVAL_MS);
}
