import { WakeEvent } from "./types";

/**
 * The WhatsApp template shells, copied VERBATIM from Bird
 * (app.bird.com → OpenCouncil workspace → Message templates; first approved
 * by Meta 2026-08-04/05, revised 2026-08-15: intro/transition name the persona «ο Νότης»,
 * conditional agenda closing, «Τι είναι αυτό;» intro button, new
 * demos_checkin — revised versions pending Meta re-approval). If a template
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
  footer: string;
  buttons: TemplateButton[];
}

const STOP_FOOTER = "Απάντησε ΣΤΟΠ για να μη λαμβάνεις μηνύματα.";

export const TEMPLATES: Record<TemplateName, TemplateDef> = {
  demos_intro: {
    name: "demos_intro",
    category: "marketing",
    bodyPrefix:
      "Γεια σου! Είμαι ο Νότης, ο βοηθός του OpenCouncil για τον δήμο σου. Θα σου γράφω σπάνια — μόνο όταν συμβαίνει κάτι που πιστεύω ότι σε αφορά — και μπορείς να μου απαντάς και να με ρωτάς οτιδήποτε για το δημοτικό συμβούλιο.",
    bodySuffix: "",
    hasVariable: false,
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
    footer: "Απάντησε ΣΤΟΠ για να λαμβάνεις μόνο email.",
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
    footer: STOP_FOOTER,
    buttons: [{ label: "Θέλω πιο συχνά", kind: "quick_reply" }],
  },
  demos_followup: {
    name: "demos_followup",
    category: "utility",
    bodyPrefix: "Σχετικά με αυτό που με ρώτησες:\n\n",
    bodySuffix: "\n\nΑν θες να το ψάξω κι άλλο, γράψε μου.",
    hasVariable: true,
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
