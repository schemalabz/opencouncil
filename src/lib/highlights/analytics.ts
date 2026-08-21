import posthog from 'posthog-js';

/**
 * Highlight analytics. Events are namespaced `highlight_*` and every one of
 * them carries the surface it happened on, so the same card can be measured
 * wherever it is used.
 */
export type HighlightSurface = 'profile' | 'meeting';

export function captureHighlight(
    event: string,
    surface: HighlightSurface,
    props: Record<string, unknown> = {}
): void {
    // PostHog is initialised only when the project token is set, and calling
    // capture before that logs an error and drops the event. Every other call
    // site in the app guards the same way.
    if (!posthog.__loaded) return;
    posthog.capture(`highlight_${event}`, { surface, ...props });
}
