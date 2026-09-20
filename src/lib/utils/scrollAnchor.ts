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

/**
 * The scrolling element a page's content sits in, marked by the meeting layout.
 * Everything that needs to reach it goes through here rather than repeating the
 * selector.
 */
export function getScrollContainer(element: Element | null | undefined): HTMLElement | null {
    return element?.closest<HTMLElement>('[data-scroll-container]') ?? null;
}

export function captureScrollAnchor(element: HTMLElement | null): ScrollAnchor | null {
    const container = getScrollContainer(element);
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

/**
 * The `scrollTop` that puts `targetTop` `marginPx` below `containerTop`,
 * measured in the same viewport-relative coordinates `getBoundingClientRect`
 * returns. Pure so the "jump to a card" math can be asserted without a DOM.
 */
export function nextScrollTopForTargetAtTop(
    containerTop: number,
    targetTop: number,
    currentScrollTop: number,
    marginPx: number,
): number {
    return Math.max(currentScrollTop + (targetTop - containerTop) - marginPx, 0);
}

/**
 * Scroll `element`'s own `[data-scroll-container]` ancestor so `element`
 * lands near the top of it, `marginPx` clear of the edge (room for a sticky
 * header that overlays the container's top).
 *
 * `Element.scrollIntoView` walks every scrollable ancestor, including the
 * `overflow-auto` pane this app nests content in — on that container it
 * drags the pane by the wrong amount instead of scrolling it directly (the
 * same failure recorded for the `/explain` reader's table of contents).
 * Writing `scrollTop` on the located container is the established fix here;
 * do not revert this back to `scrollIntoView`.
 */
export function scrollElementToContainerTop(element: HTMLElement, marginPx = 0): void {
    const container = getScrollContainer(element);
    if (!container) return;
    container.scrollTop = nextScrollTopForTargetAtTop(
        container.getBoundingClientRect().top,
        element.getBoundingClientRect().top,
        container.scrollTop,
        marginPx,
    );
}
