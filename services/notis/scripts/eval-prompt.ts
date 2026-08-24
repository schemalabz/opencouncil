/**
 * Prompt evals: replay real wakes against the live model and check what the
 * agent decided.
 *
 * Golden fixtures (src/agent/__tests__/golden.test.ts) replay RECORDED turns,
 * so they pin the harness and cost nothing — but they cannot tell you whether
 * a prompt change altered the model's judgement. Only a live run can, and the
 * model is stochastic: one sample proves nothing. This runner takes each case
 * N times and reports a pass rate.
 *
 * Cases come from production conversations exported by the admin panel
 * («Εξαγωγή JSON»), reduced to state + event + expectations by
 * scripts/eval-case-from-export.ts.
 *
 *   npm run eval:prompt -- --runs 3
 *   npm run eval:prompt -- --case local-place --runs 5
 *   npm run eval:prompt -- --prompt /tmp/candidate.md --runs 3
 *
 * Costs real money (~$0.15 per run) and hits the live MCP. Never in CI.
 */
import fs from "node:fs";
import path from "node:path";
import { runWake } from "@/agent/runWake";
import { buildDeps } from "@/lib/deps";
import type { WakeEvent, WakeOutcome, WakeState } from "@/agent/types";

interface EvalCase {
  name: string;
  /** Why this case exists — the real conversation it came from. */
  note: string;
  state: WakeState;
  event: WakeEvent;
  expect: {
    decision?: "send" | "silence";
    /** update_taste_profile fired. */
    profileWritten?: boolean;
    /** Regex the rewritten profile must match. */
    profileMatches?: string;
    /** Regex at least one sent message must match. */
    messageMatches?: string;
    /** Regex the FIRST sent message must match — what the agent led with. */
    firstMessageMatches?: string;
    /** Regex the LAST sent message must match — what it left the reader with. */
    lastMessageMatches?: string;
    /** Regex no sent message may match. */
    messageForbids?: string;
    /** record_commitment fired — the promise is durable, not just spoken. */
    commitmentRecorded?: boolean;
    /** Regex the recorded commitment's text must match. */
    commitmentMatches?: string;
  };
}

interface CheckResult {
  ok: boolean;
  label: string;
  detail?: string;
}

function check(c: EvalCase, outcome: WakeOutcome): CheckResult[] {
  const out: CheckResult[] = [];
  const e = c.expect;
  if (e.decision !== undefined) {
    out.push({
      ok: outcome.decision === e.decision,
      label: `decision=${e.decision}`,
      detail: outcome.decision,
    });
  }
  if (e.profileWritten !== undefined) {
    const wrote = outcome.profileRewrite !== undefined;
    out.push({ ok: wrote === e.profileWritten, label: `profileWritten=${e.profileWritten}` });
  }
  if (e.commitmentRecorded !== undefined) {
    const recorded = (outcome.commitments?.record ?? []).length > 0;
    out.push({
      ok: recorded === e.commitmentRecorded,
      label: `commitmentRecorded=${e.commitmentRecorded}`,
      detail: (outcome.commitments?.record ?? []).map((c) => c.slug).join(", "),
    });
  }
  if (e.commitmentMatches) {
    const re = new RegExp(e.commitmentMatches, "i");
    const all = (outcome.commitments?.record ?? []).map((c) => `${c.slug} ${c.what}`);
    out.push({
      ok: all.some((c) => re.test(c)),
      label: `commitment~/${e.commitmentMatches}/`,
      detail: all.join(" | ").slice(0, 160),
    });
  }
  if (e.profileMatches) {
    const re = new RegExp(e.profileMatches, "i");
    out.push({
      ok: re.test(outcome.profileRewrite ?? ""),
      label: `profile~/${e.profileMatches}/`,
      detail: outcome.profileRewrite?.slice(0, 160),
    });
  }
  if (e.messageMatches) {
    const re = new RegExp(e.messageMatches, "i");
    out.push({
      ok: outcome.messages.some((m) => re.test(m)),
      label: `anyMessage~/${e.messageMatches}/`,
    });
  }
  if (e.firstMessageMatches) {
    const re = new RegExp(e.firstMessageMatches, "i");
    out.push({
      ok: re.test(outcome.messages[0] ?? ""),
      label: `firstMessage~/${e.firstMessageMatches}/`,
      detail: outcome.messages[0]?.slice(0, 120),
    });
  }
  if (e.lastMessageMatches) {
    const re = new RegExp(e.lastMessageMatches, "i");
    const last = outcome.messages[outcome.messages.length - 1] ?? "";
    out.push({
      ok: re.test(last),
      label: `lastMessage~/${e.lastMessageMatches}/`,
      detail: last.slice(-120),
    });
  }
  if (e.messageForbids) {
    const re = new RegExp(e.messageForbids, "i");
    out.push({
      ok: !outcome.messages.some((m) => re.test(m)),
      label: `noMessage~/${e.messageForbids}/`,
    });
  }
  return out;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const runs = Number(arg("--runs") ?? 3);
  const only = arg("--case");
  const promptPath = arg("--prompt");
  const promptOverride = promptPath ? fs.readFileSync(promptPath, "utf8") : undefined;

  const dir = path.join(process.cwd(), "fixtures", "evals");
  const cases = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as EvalCase)
    .filter((c) => !only || c.name === only);

  if (cases.length === 0) throw new Error(`no eval cases${only ? ` named ${only}` : ""}`);
  console.log(`${cases.length} case(s) x ${runs} run(s) — prompt: ${promptPath ?? "shipped"}\n`);

  const summary: Array<{ name: string; passed: number; runs: number }> = [];

  for (const c of cases) {
    console.log(`### ${c.name}`);
    console.log(`    ${c.note}`);
    let passed = 0;
    // Runs are independent samples of the same input; parallel is fine and
    // keeps a 5-run sweep under a minute.
    const results = await Promise.all(
      Array.from({ length: runs }, async () => {
        const deps = buildDeps(promptOverride ? { promptOverride } : {});
        try {
          const { outcome } = await runWake(c.state, [c.event], deps);
          return { outcome, error: undefined as string | undefined };
        } catch (error) {
          return {
            outcome: undefined,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    for (const [i, r] of results.entries()) {
      if (!r.outcome) {
        console.log(`    run ${i + 1}: ERROR ${r.error}`);
        continue;
      }
      const checks = check(c, r.outcome);
      const ok = checks.every((x) => x.ok);
      if (ok) passed++;
      const failed = checks.filter((x) => !x.ok);
      console.log(
        `    run ${i + 1}: ${ok ? "PASS" : "FAIL"}${
          failed.length ? ` — ${failed.map((f) => f.label).join(", ")}` : ""
        }`,
      );
      for (const f of failed) if (f.detail) console.log(`        got: ${f.detail}`);
    }
    console.log(`    => ${passed}/${runs}\n`);
    summary.push({ name: c.name, passed, runs });
  }

  console.log("SUMMARY");
  for (const s of summary) console.log(`  ${s.passed}/${s.runs}  ${s.name}`);
  const total = summary.reduce((a, s) => a + s.passed, 0);
  const totalRuns = summary.reduce((a, s) => a + s.runs, 0);
  console.log(`  ${total}/${totalRuns}  TOTAL`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
