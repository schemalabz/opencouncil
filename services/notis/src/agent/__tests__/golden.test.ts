import fs from "node:fs";
import path from "node:path";
import { ReplayAnthropic } from "@/lib/replay";
import { runWake } from "../runWake";
import { Deps, RecordedTurn, WakeEvent, WakeState } from "../types";
import { FIXED_NOW } from "./helpers";

/**
 * Golden scenarios: real recorded Opus turns (exported from the playground or
 * scripts/record-scenario.ts) replayed through the full runWake loop. Free and
 * deterministic on every PR; live re-recording is the opt-in lane.
 */

interface Fixture {
  name: string;
  state: WakeState;
  event: WakeEvent;
  recordedTurns: RecordedTurn[];
  expected: {
    decision: "silence" | "send";
    messageCount: number;
    messages?: string[];
    profileRewritten: boolean;
    scheduledWakes: number;
    scheduledWakesDetail?: Array<{ at: string; reason: string }>;
    unsubscribed?: boolean;
    repairs?: string[];
  };
}

const dir = path.join(__dirname, "../../../fixtures/scenarios");
const fixtures: Fixture[] = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Fixture);

describe("golden scenarios (recorded replay)", () => {
  it("has fixtures to replay", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of fixtures) {
    it(fixture.name, async () => {
      const replay = new ReplayAnthropic(fixture.recordedTurns);
      const deps: Deps = {
        anthropic: replay,
        now: () => FIXED_NOW,
        prompts: { system: "SYSTEM", contextPack: "PACK", editorial: "ED" },
        config: { model: "claude-sonnet-5", maxTurns: 8, mcpUrl: "https://opencouncil.gr/mcp", effort: "low" },
        mcp: { call: async () => null },
      };

      const { outcome, trace } = await runWake(fixture.state, fixture.event, deps);

      expect(outcome.decision).toBe(fixture.expected.decision);
      expect(outcome.messages).toHaveLength(fixture.expected.messageCount);
      expect(outcome.profileRewrite !== undefined).toBe(fixture.expected.profileRewritten);
      expect(outcome.scheduledWakes).toHaveLength(fixture.expected.scheduledWakes);
      // Full-content assertions, present on fixtures recorded by the current
      // script: count-only checks are blind to corrupted message text.
      if (fixture.expected.messages) {
        expect(outcome.messages).toEqual(fixture.expected.messages);
      }
      if (fixture.expected.scheduledWakesDetail) {
        expect(outcome.scheduledWakes).toEqual(fixture.expected.scheduledWakesDetail);
      }
      if (fixture.expected.unsubscribed !== undefined) {
        expect(outcome.unsubscribe !== undefined).toBe(fixture.expected.unsubscribed);
      }
      expect(outcome.rationale.length).toBeGreaterThan(0);
      // Injected (nudge) turns are trace-only; compare model turns.
      expect(trace.turns.filter((t) => t.role !== "injected")).toHaveLength(
        fixture.recordedTurns.length,
      );

      // Request invariants: every request carries the MCP toolset + the five
      // client tools, and exactly two system blocks with the cache breakpoint
      // on the last one.
      for (const req of replay.requests) {
        const tools = (req.tools ?? []) as Array<{ type?: string; name?: string }>;
        expect(tools[0]).toMatchObject({ type: "mcp_toolset", mcp_server_name: "opencouncil" });
        expect(tools.map((t) => t.name).filter(Boolean)).toEqual([
          "finish_wake",
          "send_message",
          "update_taste_profile",
          "schedule_wakeup",
          "unsubscribe_user",
        ]);
        expect(req.system).toHaveLength(2);
        expect(req.system[0].cache_control).toBeUndefined();
        expect(req.system[1].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
        expect(req.mcp_servers).toHaveLength(1);
      }
    });
  }
});
