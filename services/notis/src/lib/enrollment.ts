import { TEMPLATES, type EnrollmentOrigin, type TemplateName } from "@/agent/templates";

/**
 * The pure half of the enrollment ceremony: which origin a reader gets,
 * and which readers a shell cannot reach. The poller applies these; the
 * subscriptions API asks the same questions when it reactivates a reader.
 */

export interface EnrollmentPacing {
  /**
   * The moment the site stopped routing new readers through the old
   * notification templates. An account from before it is a `transition`
   * (told the sender changed); a younger one is a `signup` (told what they
   * asked for is done). Unset means every reader is a signup.
   */
  transitionCutoff: Date | undefined;
  /**
   * How many transition readers one tick may enroll — the pacing the release
   * panel's batches used to provide. Signups never wait.
   */
  transitionsPerTick: number;
}

export function parseCutoff(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function enrollmentOriginFor(
  userCreatedAt: Date,
  cutoff: Date | undefined,
): EnrollmentOrigin {
  if (!cutoff) return "signup";
  return userCreatedAt < cutoff ? "transition" : "signup";
}

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
