/**
 * Run one poller tick from the CLI against the configured databases:
 *
 *   npx tsx --env-file=.env scripts/run-poller-tick.ts [--seed-only]
 *
 * --seed-only marks the meeting-event backlog consumed without waking
 * anyone (the quiet-start option). The tick prints its counts; in shadow
 * mode any resulting sends are recorded suppressed and Bird is never
 * called.
 */
import { runPollerTick } from "../src/lib/poller";
import { drainQueue } from "../src/lib/queue";

async function main() {
  const seedOnly = process.argv.includes("--seed-only");
  const tick = await runPollerTick({}, { seedOnly });
  console.log("poller:", JSON.stringify(tick, null, 2));
  if (!seedOnly && tick.wakesEnqueued > 0) {
    const drained = await drainQueue();
    console.log("drain:", JSON.stringify(drained));
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
