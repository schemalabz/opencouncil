/**
 * Regenerate a fixture's editorial brief on the shipped pipeline before
 * re-recording the wake. The brief is wake INPUT: re-recording alone keeps
 * the old brief, so an agenda fixture recorded before the phase-aware
 * embargo would keep leaking outcomes into its preview.
 *
 *   npx tsx scripts/refresh-brief.ts fixtures/scenarios/<name>.json
 */
import fs from "node:fs";
import path from "node:path";
import { editorialPass } from "../src/agent/editorialPass";
import { WakeEvent } from "../src/agent/types";
import { buildDeps } from "../src/lib/deps";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: npx tsx scripts/refresh-brief.ts <fixture.json>");
    process.exit(1);
  }
  const packageRoot = path.resolve(__dirname, "..");
  const candidates = [path.resolve(file), path.resolve(packageRoot, file)];
  const fixturePath = candidates.find((c) => fs.existsSync(c));
  if (!fixturePath) {
    console.error(`fixture not found (tried ${candidates.join(", ")})`);
    process.exit(1);
  }
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    name: string;
    event: WakeEvent;
  };
  const event = fixture.event;
  if (event.type !== "agenda_processed" && event.type !== "meeting_summarized") {
    console.log(`${fixture.name}: event carries no brief — nothing to refresh`);
    return;
  }
  const phase = event.type === "agenda_processed" ? ("agenda" as const) : ("summary" as const);
  const { brief, costUsd } = await editorialPass(event.cityId, event.meetingId, buildDeps(), phase);
  event.brief = brief;
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + "\n");
  console.log(
    `${fixture.name}: brief refreshed (${phase}, ${brief.subjects.length} subjects, $${costUsd.toFixed(3)})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
