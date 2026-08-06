/**
 * Hold an element still while the layout around it is rebuilt.
 *
 * Browsers do this themselves (scroll anchoring), but they anchor on the
 * focused node and drop that anchor the moment it is unmounted. Swapping a
 * focused editor back into read-only text does exactly that, and in a long
 * transcript — where speaker segments are virtualised with
 * `content-visibility: auto`, so the layout above the viewport keeps settling —
 * losing the anchor for a single frame is enough to strand the reader far from
 * where they were.
 *
 * Measure with `captureScrollAnchor`, commit the DOM change synchronously
 * (`flushSync`), then hand the replacement node to `restoreScrollAnchor`.
 */
export interface ScrollAnchor {
    container: HTMLElement;
    top: number;
}

export function captureScrollAnchor(element: HTMLElement | null): ScrollAnchor | null {
    const container = element?.closest<HTMLElement>('[data-scroll-container]');
    if (!element || !container) return null;
    return { container, top: element.getBoundingClientRect().top };
}

/**
 * `element` is whatever now stands in for the node that was measured — it need
 * not be the same node.
 */
export function restoreScrollAnchor(anchor: ScrollAnchor | null, element: HTMLElement | null): void {
    if (!anchor || !element) return;
    const drift = element.getBoundingClientRect().top - anchor.top;
    // Sub-pixel drift is rounding, not movement.
    if (Math.abs(drift) >= 1) {
        anchor.container.scrollTop += drift;
    }
}
