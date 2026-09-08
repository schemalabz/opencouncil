import posthog from 'posthog-js';
import { posthogReady } from '@/lib/utils/analyticsConsent';

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
    if (!posthogReady()) return;
    posthog.capture(`highlight_${event}`, { surface, ...props });
}
