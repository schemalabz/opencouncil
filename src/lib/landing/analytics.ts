import posthog from 'posthog-js';

/**
 * Landing (v2) analytics. Events are namespaced `landing_*` and carry shared context (device,
 * view) set from LandingV2, so call sites stay one-liners.
 */
type LandingContext = { device: 'mobile' | 'desktop'; view: string };

let context: LandingContext = { device: 'desktop', view: 'subjects' };
let firstActionFired = false;

/** Set from LandingV2 on mount and whenever the device (breakpoint) or view changes. */
export function setLandingContext(patch: Partial<LandingContext>): void {
    context = { ...context, ...patch };
}

/** Capture a landing event (non-interaction — e.g. the initial view, a prompt being shown). */
export function captureLanding(event: string, props: Record<string, unknown> = {}): void {
    posthog.capture(`landing_${event}`, { ...context, ...props });
}

/**
 * Capture a user interaction. The session's first interaction also emits `landing_first_action`
 * (with `action_type`), so the "first action" funnel needs no per-handler plumbing.
 */
export function captureLandingAction(event: string, props: Record<string, unknown> = {}): void {
    if (!firstActionFired) {
        firstActionFired = true;
        posthog.capture('landing_first_action', { ...context, action_type: event });
    }
    captureLanding(event, props);
}
