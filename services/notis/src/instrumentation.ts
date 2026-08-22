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
  const tick = () => {
    runJanitor().catch((e) => console.error("[notis:janitor] run failed:", e));
  };
  setTimeout(tick, 60_000);
  setInterval(tick, DAY_MS);
}
