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
 * Scrubbing is best-effort and NOT a substitute for reading the file. It
 * replaces the reader's name everywhere it appears — the state field, the
 * profile text and every message body, since the agent greets people by name —
 * but a learned profile can still carry a street number, a workplace or a role
 * that identifies someone. Read the output before you commit it.
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

/**
 * The agent greets people by name and writes what it learns into the profile,
 * so the reader's name appears far outside the field that holds it. Replace
 * every token of it, everywhere, before anything is written to disk.
 */
const ANON = "Ο αναγνώστης";
const nameTokens = (data.subscription.userName ?? "")
  .split(/\s+/)
  .map((t) => t.trim())
  .filter((t) => t.length >= 3);

/**
 * Greek accents make naive matching useless: the stored userName may be unaccented
 * while the agent writes it accented. Stripping combining marks after NFD leaves
 * the character count unchanged for Greek, so offsets found in the stripped
 * text apply directly to the original.
 */
function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** The pseudonym written over the reader's real name. */
const ANON_NAME = "Εύα";

function scrub<T>(value: T): T {
  if (nameTokens.length === 0) return value;
  let text = JSON.stringify(value);
  for (const token of nameTokens) {
    // Match the stem, so inflected forms go with the nominative.
    const stem = stripAccents(token).slice(0, Math.max(3, token.length - 1));
    // Search forward from the end of each replacement. Restarting at 0 hangs
    // whenever the pseudonym itself matches the stem — a reader actually
    // whose name matches the pseudonym has a stem the replacement strips to, and
    // the search finds it again for ever.
    let from = 0;
    for (;;) {
      const at = stripAccents(text).toLowerCase().indexOf(stem.toLowerCase(), from);
      if (at === -1) break;
      // Consume the inflected ending too: letters immediately following.
      let end = at + stem.length;
      while (end < text.length && /\p{L}/u.test(text[end])) end++;
      text = text.slice(0, at) + ANON_NAME + text.slice(end);
      from = at + ANON_NAME.length;
    }
  }
  return JSON.parse(text) as T;
}

const evalCase = {
  name,
  note: `From a real conversation, wake ${wakeIdxArg}. Reader: ${JSON.stringify(
    (target.event as { text?: string }).text ?? target.eventType,
  )}`,
  state: {
    // Anonymized: the reader is a real person and this file is committed.
    user: { name: ANON, cities: [] as unknown[] },
    profile: scrub(data.subscription.profileText),
    conversation: scrub(conversation),
    decisions: scrub(decisions),
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
console.log(
  "READ THE FILE BEFORE COMMITTING: the name is replaced, but a learned profile " +
    "can still carry a street number, a workplace or a role that identifies someone.",
);
