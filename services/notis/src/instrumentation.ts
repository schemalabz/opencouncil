// This file must exist even when empty of real work: without it, Next's
// instrumentation discovery (which searches the Turbopack workspace root's
// src/ as well) picks up the MAIN app's src/instrumentation.ts and tries to
// bundle its Prisma/cache imports into Notis.
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
}
