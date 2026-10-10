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

/**
 * The `scrollTop` that centres a target of `targetHeight` at `targetTop` in
 * the band between `bandTop` and `bandBottom`, all measured in the
 * viewport-relative coordinates `getBoundingClientRect` returns. Pure so the
 * centring math can be asserted without a DOM.
 */
export function nextScrollTopForTargetCentered(
    bandTop: number,
    bandBottom: number,
    targetTop: number,
    targetHeight: number,
    currentScrollTop: number,
): number {
    const bandMiddle = (bandTop + bandBottom) / 2;
    return Math.max(currentScrollTop + targetTop + targetHeight / 2 - bandMiddle, 0);
}

/** A target this close to where it was placed has not moved. */
const SETTLE_TOLERANCE_PX = 8;
/** Frames the target has to hold still before the hold ends. */
const SETTLE_STILL_FRAMES = 8;
/** The longest a hold lasts, in frames: about 1.5 s at 60 Hz. */
const SETTLE_MAX_FRAMES = 90;
/**
 * Corrections that keep changing direction are a tug of war with chrome that
 * reacts to the scroll position, such as the banner that shrinks once the
 * pane has scrolled. The hold gives up instead of flickering.
 */
const SETTLE_MAX_REVERSALS = 3;
/** Room from the band's edges for a target to count as in view. */
const IN_VIEW_PADDING_PX = 12;
/** The band kept open between the overlays, however tall they are. */
const MIN_BAND_PX = 48;
/** Input that means the reader is about to scroll on their own. */
const SCROLL_INTENT_EVENTS = ['wheel', 'touchstart', 'pointerdown'] as const;
const SCROLL_INTENT_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown']);

/** The hold in progress on a container, so the next hold can end it. */
const holds = new WeakMap<HTMLElement, () => void>();

/** The first line of a wrapped inline element, or the whole box. */
function firstLineRect(element: HTMLElement): DOMRect {
    return element.getClientRects()[0] ?? element.getBoundingClientRect();
}

/** Where a sticky element sticks, in px from the top of its scroll port; 0 when it does not stick. */
function stickyOffset(element: HTMLElement): number {
    const top = parseFloat(getComputedStyle(element).top);
    return Number.isFinite(top) ? top : 0;
}

/**
 * The height of the fixed chrome over the bottom of a scroll container. The
 * meeting layout reserves it as bottom padding on its `[data-scroll-content]`
 * child, so that the content can scroll out from under the playback dock.
 */
function bottomChromeHeight(container: HTMLElement): number {
    const content = container.querySelector<HTMLElement>(':scope > [data-scroll-content]');
    const padding = content ? parseFloat(getComputedStyle(content).paddingBottom) : NaN;
    return Number.isFinite(padding) ? padding : 0;
}

/** A keystroke that scrolls the pane, as opposed to one a shortcut or a text field consumed. */
function scrollsThePane(event: KeyboardEvent): boolean {
    if (!SCROLL_INTENT_KEYS.has(event.key) || event.defaultPrevented) return false;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return true;
    return !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable);
}

interface Band {
    top: number;
    bottom: number;
}

/**
 * The part of the container a reader can see, in viewport coordinates: below
 * `overlay` (a sticky section header: its sticky offset plus its height, which
 * is where it sits whether or not it is stuck) and above the fixed chrome at
 * the bottom.
 */
function visibleBand(container: HTMLElement, overlay: HTMLElement | null): Band {
    const rect = container.getBoundingClientRect();
    const overlayInset = overlay ? stickyOffset(overlay) + overlay.getBoundingClientRect().height : 0;
    const bottom = Math.max(rect.bottom - bottomChromeHeight(container), rect.top + MIN_BAND_PX);
    const top = Math.max(rect.top, Math.min(rect.top + overlayInset, bottom - MIN_BAND_PX));
    return { top, bottom };
}

/**
 * Bring `element` into view inside its `[data-scroll-container]` ancestor.
 * Nothing moves when it is in view already. Otherwise the element lands in the
 * middle of the visible band, and it is held there while the layout around it
 * settles.
 *
 * The hold is what makes a jump in the transcript land. Speaker segments are
 * virtualised with `content-visibility: auto`, so the segments between the
 * reader and a far target are laid out only when the scroll reaches them, and
 * their real heights push the target away from where it was placed. A single
 * `scrollIntoView` (see `scrollElementToContainerTop` for why not that call)
 * therefore ended up anywhere from a few lines to a few screens off. The hold
 * re-centres the target on each frame until it has kept still, and lets go as
 * soon as the reader scrolls on their own.
 */
function revealElementInContainer(element: HTMLElement, overlay: HTMLElement | null): void {
    const container = getScrollContainer(element);
    if (!container) {
        element.scrollIntoView({ block: 'center' });
        return;
    }

    // Measured once. Chrome that reacts to the scroll position must not move
    // the band under the hold; only the target moves.
    const band = visibleBand(container, overlay);
    const target = firstLineRect(element);
    if (target.top >= band.top + IN_VIEW_PADDING_PX && target.bottom <= band.bottom - IN_VIEW_PADDING_PX) return;

    // A hold on an earlier target keeps going when the new target is in view
    // already: both then sit in the same settled viewport.
    holds.get(container)?.();

    // The scroll change applied, 0 when the target had not moved.
    const center = (): number => {
        const line = firstLineRect(element);
        const before = container.scrollTop;
        // A request past the end is clamped by the browser; clamp it here too, so
        // a target near the end of the transcript reads as placed, not as moving.
        const farthest = container.scrollHeight - container.clientHeight;
        const wanted = nextScrollTopForTargetCentered(band.top, band.bottom, line.top, line.height, before);
        const next = farthest > 0 ? Math.min(wanted, farthest) : wanted;
        if (Math.abs(next - before) < SETTLE_TOLERANCE_PX) return 0;
        container.scrollTop = next;
        return container.scrollTop - before;
    };
    center();
    holdCentered(container, element, center);
}

/**
 * Call `center` on each frame until the element has kept still, until the hold
 * times out, until the corrections start to alternate, or until the reader
 * scrolls on their own. One hold per container: the next one ends it.
 */
function holdCentered(container: HTMLElement, element: HTMLElement, center: () => number): void {
    let cancelled = false;
    let frames = 0;
    let stillFrames = 0;
    let lastDirection = 0;
    let reversals = 0;
    let expectedScrollTop = container.scrollTop;
    const release = () => {
        cancelled = true;
        if (holds.get(container) === release) holds.delete(container);
        for (const type of SCROLL_INTENT_EVENTS) container.removeEventListener(type, release);
        container.removeEventListener('scroll', onScroll);
        window.removeEventListener('keydown', onKeyDown);
    };
    // A scroll the hold did not write: a scrollbar drag, a focus move, a key
    // the browser handled. The reader took over.
    const onScroll = () => {
        if (Math.abs(container.scrollTop - expectedScrollTop) > SETTLE_TOLERANCE_PX) release();
    };
    const onKeyDown = (event: KeyboardEvent) => {
        if (scrollsThePane(event)) release();
    };
    for (const type of SCROLL_INTENT_EVENTS) container.addEventListener(type, release, { passive: true });
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    holds.set(container, release);

    const tick = () => {
        if (cancelled) return;
        if (!element.isConnected) {
            release();
            return;
        }
        const delta = center();
        expectedScrollTop = container.scrollTop;
        if (delta === 0) {
            stillFrames += 1;
        } else {
            stillFrames = 0;
            const direction = Math.sign(delta);
            if (lastDirection !== 0 && direction !== lastDirection) reversals += 1;
            lastDirection = direction;
        }
        frames += 1;
        if (stillFrames >= SETTLE_STILL_FRAMES || frames >= SETTLE_MAX_FRAMES || reversals >= SETTLE_MAX_REVERSALS) {
            release();
            return;
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

/**
 * Bring an utterance into view, allowing for the sticky header of its speaker
 * segment, for the banner that header sticks under on an unverified
 * transcript, and for the playback dock over the bottom of the pane.
 */
export function revealUtterance(element: HTMLElement): void {
    const overlay = element.closest('[role="listitem"]')?.querySelector<HTMLElement>('[data-segment-header]') ?? null;
    revealElementInContainer(element, overlay);
}
