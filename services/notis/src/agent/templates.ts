import { WakeEvent } from "./types";

/**
 * The WhatsApp template shells, copied VERBATIM from Bird
 * (app.bird.com → OpenCouncil workspace → Message templates; first approved
 * by Meta 2026-08-04/05, revised 2026-08-15: intro/transition name the persona «ο Νότης»,
 * conditional agenda closing, «Τι είναι αυτό;» intro button, new
 * demos_checkin; revised again 2026-08-19 so every footer carries the AI
 * disclosure the AI Act asks for). If a template
 * changes in Bird, this file must change with it — the simulator and the
 * production send path both render from here, so what you see simulated is
 * what Meta approved.
 *
 * Cold sends (outside the 24h customer-service window) MUST use one of these
 * shells; free-form text is only deliverable inside the window.
 */

export type TemplateName =
  | "demos_intro"
  | "demos_transition"
  | "demos_update_agenda"
  | "demos_update_news"
  | "demos_followup"
  | "demos_checkin";

export interface TemplateButton {
  label: string;
  kind: "url" | "quick_reply";
}

export interface TemplateDef {
  name: TemplateName;
  category: "marketing" | "utility";
  /** Fixed text before the agent-written variable ({{demos_text}}); the whole body for fixed templates. */
  bodyPrefix: string;
  /** Fixed text after the variable; empty for fixed templates. */
  bodySuffix: string;
  /** true when the body carries the {{demos_text}} variable. */
  hasVariable: boolean;
  /**
   * true when the shell's URL button is DYNAMIC — Bird holds it as
   * `https://opencouncil.gr/{{link_path}}` and rejects the send with a 422
   * ("missing value for variable 'link_path'") unless the parameter is
   * supplied. Verified against the Bird console: the three shells that carry
   * {{demos_text}} also carry {{link_path}}; intro, transition and checkin
   * declare no variables at all.
   */
  hasLinkPath: boolean;
  footer: string;
  buttons: TemplateButton[];
}

/**
 * Two obligations in 60 characters, which is WhatsApp's cap for a footer.
 *
 * The AI disclosure comes first: the EU AI Act (Article 50) requires telling
 * a person they are dealing with an AI system, and every one of these shells
 * carries text an agent wrote. The opt-out keeps its place beside it, in the
 * shortest wording that still reads as an instruction — «Απάντησε ΣΤΟΠ για να
 * μη λαμβάνεις μηνύματα.» plus the disclosure came to 72 characters, so
 * something had to give and it was not the disclosure.
 */
const STOP_FOOTER = "Μήνυμα με τεχνητή νοημοσύνη. ΣΤΟΠ για διακοπή.";

/** The transition cohort keeps receiving email, so ΣΤΟΠ means something
 *  different for them: it narrows the channel rather than ending contact. */
const STOP_FOOTER_EMAIL = "Μήνυμα με τεχνητή νοημοσύνη. ΣΤΟΠ για μόνο email.";

export const TEMPLATES: Record<TemplateName, TemplateDef> = {
  demos_intro: {
    name: "demos_intro",
    category: "marketing",
    bodyPrefix:
      "Γεια σου! Είμαι ο Νότης, ο βοηθός του OpenCouncil για τον δήμο σου. Θα σου γράφω σπάνια — μόνο όταν συμβαίνει κάτι που πιστεύω ότι σε αφορά — και μπορείς να μου απαντάς και να με ρωτάς οτιδήποτε για το δημοτικό συμβούλιο.",
    bodySuffix: "",
    hasVariable: false,
    hasLinkPath: false,
    footer: STOP_FOOTER,
    buttons: [
      { label: "Περισσότερα", kind: "url" },
      { label: "Τι είναι αυτό;", kind: "quick_reply" },
    ],
  },
  demos_transition: {
    name: "demos_transition",
    category: "marketing",
    bodyPrefix:
      "Οι ειδοποιήσεις του OpenCouncil αλλάζουν! Από εδώ και πέρα σου γράφω εγώ, ο Νότης, ο βοηθός του OpenCouncil. Θα σου στέλνω λιγότερα και πιο προσωπικά μηνύματα, μόνο όταν συμβαίνει κάτι που πραγματικά σε αφορά, και μπορείς να μου απαντάς και να με ρωτάς οτιδήποτε για τον δήμο σου. Τα email σου συνεχίζουν κανονικά.",
    bodySuffix: "",
    hasVariable: false,
    hasLinkPath: false,
    footer: STOP_FOOTER_EMAIL,
    buttons: [
      { label: "Περισσότερα", kind: "url" },
      { label: "Ας γνωριστούμε", kind: "quick_reply" },
    ],
  },
  demos_update_agenda: {
    name: "demos_update_agenda",
    category: "utility",
    bodyPrefix: "Πριν την επόμενη συνεδρίαση, κάτι που σε αφορά:\n\n",
    bodySuffix: "\n\nΑν συζητηθεί κάτι που σε αφορά, θα σου πω.",
    hasVariable: true,
    hasLinkPath: true,
    footer: STOP_FOOTER,
    buttons: [
      { label: "Δες το θέμα", kind: "url" },
      { label: "Πες μου περισσότερα", kind: "quick_reply" },
    ],
  },
  demos_update_news: {
    name: "demos_update_news",
    category: "utility",
    bodyPrefix: "Νέα από τον δήμο σου:\n\n",
    bodySuffix: "\n\nΠερισσότερα στο link.",
    hasVariable: true,
    hasLinkPath: true,
    footer: STOP_FOOTER,
    buttons: [
      { label: "Δες περισσότερα", kind: "url" },
      { label: "Πες μου περισσότερα", kind: "quick_reply" },
    ],
  },
  demos_checkin: {
    name: "demos_checkin",
    category: "marketing",
    // Deliberate-frequency downgrade for readers who never respond. Added
    // 2026-08-15; no send path uses it yet (a PR 4+ policy decides when).
    bodyPrefix:
      "Επειδή δεν απαντάς σε αυτά τα μηνύματα, θα σου γράφω πλέον μόνο κάθε λίγους μήνες, για τα πολύ σημαντικά. Αν με θες πιο συχνά, γράψε μου.",
    bodySuffix: "",
    hasVariable: false,
    hasLinkPath: false,
    footer: STOP_FOOTER,
    buttons: [{ label: "Θέλω πιο συχνά", kind: "quick_reply" }],
  },
  demos_followup: {
    name: "demos_followup",
    category: "utility",
    bodyPrefix: "Σχετικά με αυτό που με ρώτησες:\n\n",
    bodySuffix: "\n\nΑν θες να το ψάξω κι άλλο, γράψε μου.",
    hasVariable: true,
    hasLinkPath: true,
    footer: STOP_FOOTER,
    buttons: [
      { label: "Δες το θέμα", kind: "url" },
      { label: "Πες μου περισσότερα", kind: "quick_reply" },
    ],
  },
};

export interface RenderedTemplate {
  template: TemplateName;
  body: string;
  footer: string;
  buttons: TemplateButton[];
}

/** Render a template shell around agent-written text (ignored by fixed templates). */
export function renderTemplate(name: TemplateName, text = ""): RenderedTemplate {
  const def = TEMPLATES[name];
  const body = def.hasVariable ? `${def.bodyPrefix}${text}${def.bodySuffix}` : def.bodyPrefix;
  return { template: name, body, footer: def.footer, buttons: def.buttons };
}

/**
 * The origins whose threads open with an intro template. An inbound-origin
 * thread opens with the reader's own message and never gets one.
 */
export type EnrollmentOrigin = "transition" | "signup";

/** Which shell opens the thread, by how the reader entered Notis. */
export function introTemplateFor(origin: EnrollmentOrigin): TemplateName {
  return origin === "transition" ? "demos_transition" : "demos_intro";
}

/**
 * Which shell a cold proactive send must use, by the event that woke the
 * agent. A scheduled wake's shell depends on why the schedule existed: a
 * promised answer to a reader question rides demos_followup («Σχετικά με
 * αυτό που με ρώτησες»); a self-scheduled follow-up to proactive news must
 * NOT frame an answer to a question nobody asked, so it rides
 * demos_update_news. An absent origin is a pre-PR-4 record — every one of
 * those came from a user_message wake, so "reply" is the honest default.
 */
export function templateForEvent(event: WakeEvent): TemplateName {
  switch (event.type) {
    case "agenda_processed":
      return "demos_update_agenda";
    case "meeting_summarized":
      return "demos_update_news";
    case "scheduled":
      return event.origin === "proactive" ? "demos_update_news" : "demos_followup";
    default:
      return "demos_update_news";
  }
}

/**
 * Meta's customer-service window: 24h from the user's last inbound message.
 * Inside it, free-form messages are allowed; outside it, templates only.
 */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(lastUserMessageAt: string | undefined, now: Date): boolean {
  if (!lastUserMessageAt) return false;
  return now.getTime() - new Date(lastUserMessageAt).getTime() < SERVICE_WINDOW_MS;
}

/**
 * The path AFTER https://opencouncil.gr/ for a template's URL button.
 *
 * Two sources, in this order:
 *
 * 1. The wake's event, when it names a meeting. Deterministic, always
 *    present, and it matches what the shells were built for — every example
 *    value in Bird is a meeting path («athens/jul15_2026»). The meeting page
 *    also contains every subject the message mentions, so it is never the
 *    wrong destination, only a less specific one.
 * 2. The link the agent wrote into the body, for a scheduled follow-up, whose
 *    event names no meeting and so has no first source.
 *
 * The body is deliberately the fallback rather than the primary. Reading it
 * first meant a message covering two subjects silently pointed its button at
 * whichever the agent happened to mention first.
 */
export function linkPathForEvent(event: WakeEvent): string | undefined {
  switch (event.type) {
    case "agenda_processed":
    case "meeting_summarized":
      // Encoded: these are internal slugs today, but they end up inside a
      // public URL, and a stray space or slash would break the button.
      return `${encodeURIComponent(event.cityId)}/${encodeURIComponent(event.meetingId)}`;
    default:
      // scheduled and heartbeat carry no meeting; user_message never sends a
      // template at all.
      return undefined;
  }
}

const OPENCOUNCIL_LINK = /https?:\/\/(?:www\.)?opencouncil\.gr\/([^\s)\]»,;]+)/i;

export function linkPathFromText(text: string): string | undefined {
  const match = OPENCOUNCIL_LINK.exec(text);
  if (!match) return undefined;
  // A query or fragment is not part of the path, and Bird substitutes this
  // into an approved base URL that expects a path segment — sending
  // «athens/x?utm=wa» risks the same 422 this whole mechanism exists to avoid.
  const path = match[1]
    .split(/[?#]/)[0]
    // Trailing sentence punctuation is prose, not path.
    .replace(/[.,;:!?»)\]]+$/, "");
  return path || undefined;
}

/**
 * The variables a shell declares, as Bird names them.
 *
 * One list, used by two callers that must never disagree: the sender builds
 * its parameters from it, and the drift check compares it to what the Bird
 * console actually holds. A mirror checked against a different list from the
 * one the sender uses would pass while the sends still failed.
 */
export function declaredVariables(name: TemplateName): string[] {
  const def = TEMPLATES[name];
  return [...(def.hasVariable ? ["demos_text"] : []), ...(def.hasLinkPath ? ["link_path"] : [])];
}

export interface TemplateDrift {
  template: TemplateName;
  /** Bird declares it; we never send it — every send of this shell 422s. */
  missing: string[];
  /** We send it; Bird does not declare it. Ignored today, but the mirror is wrong. */
  unexpected: string[];
}

/** Compare one shell's mirror against the variable keys Bird reports. */
export function compareTemplateVariables(
  name: TemplateName,
  birdKeys: string[],
): TemplateDrift | null {
  const ours = new Set(declaredVariables(name));
  const theirs = new Set(birdKeys);
  const missing = [...theirs].filter((k) => !ours.has(k)).sort();
  const unexpected = [...ours].filter((k) => !theirs.has(k)).sort();
  return missing.length || unexpected.length ? { template: name, missing, unexpected } : null;
}
