import posthog from 'posthog-js';
import { captureLandingAction } from '@/lib/landing/analytics';

/**
 * The app-wide capture helper for typed product events (the redesigned city,
 * meeting, subject, person and party surfaces). Events are flat snake_case
 * names; shared components carry a `surface` property instead of a per-surface
 * event name, so one insight can compare surfaces (the highlight_* pattern).
 */
export function captureEvent(event: string, props: Record<string, unknown> = {}): void {
    // PostHog is initialised only when the project token is set, and calling
    // capture before that logs an error and drops the event.
    if (!posthog.__loaded) return;
    posthog.capture(event, props);
}

/** Where a shared subject-map component is mounted. */
export type MapSurface = 'landing' | 'city_map' | 'meeting_map';

/**
 * Capture from a component the landing shares with the city and meeting maps.
 * On the landing it stays in the `landing_*` family (its dashboard, its
 * module context, its first-action funnel); anywhere else it emits the plain
 * event with `surface`, so the landing funnels stop counting city-page
 * sessions and the landing context stops leaking onto other pages.
 */
export function captureMapAction(surface: MapSurface, event: string, props: Record<string, unknown> = {}): void {
    if (surface === 'landing') {
        captureLandingAction(event, props);
        return;
    }
    captureEvent(event, { surface, ...props });
}
