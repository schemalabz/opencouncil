/**
 * The deterministic unsubscribe pre-step (PRD §6: "Unsubscribe keywords
 * honored deterministically, before the agent sees the message").
 *
 * Deliberately strict: it fires only when the message IS the stop keyword —
 * anything longer («θέλω να απεγγραφώ», «γιατί έγινε διακοπή νερού;») goes
 * to the agent, which carries the unsubscribe_user tool and handles intent
 * with context. The main app's broad-regex + LLM-verify flow is NOT ported:
 * a broad regex needs the verifier to avoid false positives, and the agent
 * already is the verifier for anything beyond a bare ΣΤΟΠ.
 */

const STOP_WORDS = new Set(["stop", "στοπ"]);

export function isBareStop(body: string | null | undefined): boolean {
  if (!body) return false;
  const normalized = body
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Strip surrounding punctuation, symbols and whitespace so «ΣΤΟΠ!» and
    // « stop. » still count as bare.
    .replace(/^[^a-zα-ω]+|[^a-zα-ω]+$/gu, "");
  return STOP_WORDS.has(normalized);
}

// Replies in the Notis voice (second person singular), consistent with the
// demos_transition footer promise: «Απάντησε ΣΤΟΠ για να λαμβάνεις μόνο email.»
export const STOP_CONFIRMATION_TEXT =
  "Έγινε — δεν θα σου ξαναγράψω εδώ. Οι ενημερώσεις με email συνεχίζουν κανονικά.";

export const STOP_ALREADY_TEXT =
  "Δεν σου στέλνω πλέον μηνύματα εδώ. Οι ενημερώσεις με email συνεχίζουν κανονικά.";
