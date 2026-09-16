import type { CSSProperties } from 'react';
import type { CapturedExcerpt } from './selection';

/** The button's `min-h-11`: its side is chosen before the button exists. */
const TOOLBAR_HEIGHT = 44;
/** Between the selection and the button. */
const GAP = 8;
/** The button keeps off the viewport's edges. */
const INSET_X = 16;
const INSET_Y = 12;

/**
 * Where the share button sits: centred on the selection, and above it, so the
 * lines a reader is about to add to the selection stay uncovered. Below it
 * when the top of the viewport leaves no room, and on a touch screen, where
 * the platform's own callout owns the space above. Clamped to the viewport,
 * so a selection scrolled out of view keeps its button at the nearer edge.
 */
export function toolbarPlacement(rect: CapturedExcerpt['rect'], viewport: { width: number; height: number }, preferAbove: boolean): CSSProperties {
    const centre = (rect.left + rect.right) / 2;
    const style: CSSProperties = {
        left: centre,
        // A `translate` percentage is the button's own width, which only the
        // layout knows: centre on the selection, then keep both edges inside.
        transform: `translateX(clamp(${INSET_X - centre}px, -50%, ${viewport.width - INSET_X - centre}px - 100%))`,
    };
    if (preferAbove && rect.top - GAP - TOOLBAR_HEIGHT >= INSET_Y) {
        // Anchored by its bottom edge, so a taller button still clears the selection.
        style.bottom = Math.max(INSET_Y, viewport.height - rect.top + GAP);
    } else {
        style.top = Math.min(Math.max(INSET_Y, rect.bottom + GAP), viewport.height - INSET_Y - TOOLBAR_HEIGHT);
    }
    return style;
}
