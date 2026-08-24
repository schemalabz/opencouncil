/**
 * Turn an exported conversation into an eval case.
 *
 *   npx tsx scripts/eval-case-from-export.ts <export.json> <wakeIndex> <name>
 *
 * Rebuilds the state as it was when that wake started — the conversation and
 * decisions BEFORE the reader's message, never the wake's own replies (a
 * later cutoff leaks the answer back in and the model correctly refuses to
 * repeat itself). The reader's name is replaced and the phone dropped: these
 * files live in the repository, the conversations are real people's.
 *
 * Expectations are left empty on purpose — write them by hand after reading
 * what the case is actually testing.
 */
import fs from "node:fs";
import path from "node:path";

interface ExportedMessage {
  wakeId: string | null;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
  status: string | null;
}
interface ExportedWake {
  id: string;
  eventType: string;
  eventAt: string;
  event: Record<string, unknown>;
  decision: string;
  rationale: string;
}

const [, , exportPath, wakeIdxArg, name] = process.argv;
if (!exportPath || wakeIdxArg === undefined || !name) {
  throw new Error("usage: eval-case-from-export.ts <export.json> <wakeIndex> <name>");
}

const data = JSON.parse(fs.readFileSync(exportPath, "utf8")) as {
  subscription: { userName: string; profileText: string };
  messages: ExportedMessage[];
  wakes: ExportedWake[];
};

const target = data.wakes[Number(wakeIdxArg)];
if (!target) throw new Error(`no wake at index ${wakeIdxArg}`);
const cutoff = new Date(target.eventAt).getTime();

const conversation = data.messages
  .filter((m) => new Date(m.createdAt).getTime() < cutoff && m.wakeId !== target.id)
  .filter(
    (m) => m.direction === "inbound" || ["sent", "delivered", "read"].includes(m.status ?? ""),
  )
  .map((m) => ({
    at: m.createdAt,
    from: m.direction === "inbound" ? "reader" : "notis",
    text: m.body,
  }));

const decisions = data.wakes
  .filter((w) => new Date(w.eventAt).getTime() < cutoff)
  .map((w) => ({
    at: w.eventAt,
    event: w.eventType,
    decision: w.decision,
    rationale: w.rationale,
  }));

const evalCase = {
  name,
  note: `From a real conversation, wake ${wakeIdxArg}. Reader: ${JSON.stringify(
    (target.event as { text?: string }).text ?? target.eventType,
  )}`,
  state: {
    // Anonymized: the reader is a real person and this file is committed.
    user: { name: "Ο αναγνώστης", cities: [] as unknown[] },
    profile: data.subscription.profileText,
    conversation,
    decisions,
  },
  event: target.event,
  expect: {},
};

const dir = path.join(process.cwd(), "fixtures", "evals");
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `${name}.json`);
fs.writeFileSync(out, JSON.stringify(evalCase, null, 2) + "\n");
console.log(`wrote ${out}`);
console.log("cities[] and expect{} are yours to fill in.");
