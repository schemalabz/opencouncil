import { TEMPLATES, type TemplateName } from "@/agent/templates";

/**
 * The pure half of the enrollment ceremony: which readers a shell cannot
 * reach. The poller applies it; the subscriptions API asks the same
 * question when it reactivates a reader.
 */

/**
 * Meta refuses a marketing template to a +1 number (error 131049,
 * deterministic, never retried) — and the failure would then ride the SMS
 * fallback across the Atlantic. Such a reader waits until the shell they
 * need is filed as utility; the reader's own reply opens the thread without
 * a template at all.
 */
export function isHeldForMarketing(template: TemplateName, phoneE164: string): boolean {
  return TEMPLATES[template].category === "marketing" && phoneE164.startsWith("+1");
}
