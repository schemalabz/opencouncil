/**
 * Re-record a golden scenario against the live Anthropic API + production MCP.
 *
 *   npx tsx scripts/record-scenario.ts fixtures/scenarios/<name>.json
 *
 * Reads the fixture's state + event, runs a live wake with the SHIPPED
 * prompts, and rewrites recordedTurns + expected in place. Costs real money
 * (one Opus wake, ~$0.05-0.40); intended for the opt-in drift-check lane, not
 * CI. Review the diff before committing — a changed decision is a finding,
 * not an update.
 */
import fs from "node:fs";
import path from "node:path";
import { runWake } from "../src/agent/runWake";
import { WakeEvent, WakeState, RecordedTurn } from "../src/agent/types";
import { buildDeps } from "../src/lib/deps";
import { RecordingAnthropic } from "../src/lib/replay";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: npx tsx scripts/record-scenario.ts <fixture.json>");
    process.exit(1);
  }
  const fixturePath = path.resolve(file);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    name: string;
    state: WakeState;
    event: WakeEvent;
    recordedTurns: RecordedTurn[];
    expected: Record<string, unknown>;
  };

  const deps = buildDeps();
  const recorder = new RecordingAnthropic(deps.anthropic);
  const { outcome, trace } = await runWake(fixture.state, fixture.event, {
    ...deps,
    anthropic: recorder,
  });

  const previous = fixture.expected;
  fixture.recordedTurns = recorder.recorded;
  fixture.expected = {
    decision: outcome.decision,
    messageCount: outcome.messages.length,
    profileRewritten: outcome.profileRewrite !== undefined,
    scheduledWakes: outcome.scheduledWakes.length,
  };
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + "\n");

  console.log(`re-recorded ${fixture.name}: $${trace.costUsd.toFixed(3)}`);
  console.log("previous expected:", JSON.stringify(previous));
  console.log("new expected:     ", JSON.stringify(fixture.expected));
  if (JSON.stringify(previous) !== JSON.stringify(fixture.expected)) {
    console.log("⚠ DECISION DRIFT — review before committing.");
  }
}

void main();
