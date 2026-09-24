import {
    captureScrollAnchor,
    getScrollContainer,
    nextScrollTopForTargetAtTop,
    restoreScrollAnchor,
    scrollElementToContainerTop,
} from '@/lib/utils/scrollAnchor';

// Regression guard for #367: saving an utterance mid-segment used to strand the
// editor near the end of the segment. Named .test.tsx so jest runs it under
// jsdom — these helpers are pure DOM, no React.

// jsdom has no layout, so each element reports the top its `data-top` says.
beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value(this: HTMLElement) {
            const top = Number(this.dataset.top ?? 0);
            return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top } as DOMRect;
        },
    });
});

/** jsdom's own scrollTop is inert, so back it with a plain value. */
const trackScrollTop = (el: HTMLElement, initial: number) => {
    let value = initial;
    Object.defineProperty(el, 'scrollTop', {
        configurable: true,
        get: () => value,
        set: (next: number) => { value = next; },
    });
    return () => value;
};

const build = (top: number) => {
    document.body.innerHTML = `
        <div data-scroll-container id="scroller">
            <span id="utterance" data-top="${top}"></span>
        </div>`;
    return {
        scroller: document.getElementById('scroller')!,
        utterance: document.getElementById('utterance')!,
    };
};

describe('scrollAnchor', () => {
    it('scrolls the container to keep the replacement node where the old one was', () => {
        const { scroller, utterance } = build(500);
        const scrollTop = trackScrollTop(scroller, 4000);

        const anchor = captureScrollAnchor(utterance);
        // The surrounding layout collapses and drags the utterance 480px up.
        utterance.dataset.top = '20';
        restoreScrollAnchor(anchor, utterance);

        expect(scrollTop()).toBe(3520);
    });

    it('anchors the replacement node, which need not be the one measured', () => {
        const { scroller, utterance } = build(500);
        const scrollTop = trackScrollTop(scroller, 4000);

        const anchor = captureScrollAnchor(utterance);
        // The editor box gives way to a fresh span, as React's swap does.
        const replacement = document.createElement('span');
        replacement.dataset.top = '620';
        utterance.replaceWith(replacement);
        restoreScrollAnchor(anchor, replacement);

        expect(scrollTop()).toBe(4120);
    });

    it('ignores sub-pixel drift', () => {
        const { scroller, utterance } = build(500);
        const scrollTop = trackScrollTop(scroller, 4000);

        const anchor = captureScrollAnchor(utterance);
        utterance.dataset.top = '500.4';
        restoreScrollAnchor(anchor, utterance);

        expect(scrollTop()).toBe(4000);
    });

    it('captures nothing outside a scroll container', () => {
        document.body.innerHTML = '<span id="orphan" data-top="500"></span>';
        expect(captureScrollAnchor(document.getElementById('orphan'))).toBeNull();
    });

    it('finds the enclosing scroll container, or nothing', () => {
        const { scroller, utterance } = build(500);
        expect(getScrollContainer(utterance)).toBe(scroller);
        expect(getScrollContainer(scroller)).toBe(scroller);
        expect(getScrollContainer(document.body)).toBeNull();
        expect(getScrollContainer(null)).toBeNull();
    });

    it('is a no-op without an anchor or a node to restore', () => {
        const { scroller, utterance } = build(500);
        const scrollTop = trackScrollTop(scroller, 4000);

        const anchor = captureScrollAnchor(utterance);
        utterance.dataset.top = '20';
        restoreScrollAnchor(null, utterance);
        restoreScrollAnchor(anchor, null);

        expect(scrollTop()).toBe(4000);
    });
});

// Regression guard: `handleJumpToTable` used to call `scrollIntoView`, which
// drags the wrong element inside a `[data-scroll-container]` pane and
// over/undershoots. These pin the direct-scrollTop replacement.
describe('nextScrollTopForTargetAtTop', () => {
    it('scrolls down to bring a target below the container up to the margin', () => {
        // Container top at 100, target top at 810 (below the fold), current
        // scrollTop 4000, 16px margin: scroll forward by 810 - 100 - 16.
        expect(nextScrollTopForTargetAtTop(100, 810, 4000, 16)).toBe(4694);
    });

    it('scrolls up to bring a target above the container down to the margin', () => {
        expect(nextScrollTopForTargetAtTop(100, 20, 4000, 16)).toBe(3904);
    });

    it('never asks for a negative scrollTop', () => {
        expect(nextScrollTopForTargetAtTop(100, 90, 5, 16)).toBe(0);
    });
});

describe('scrollElementToContainerTop', () => {
    it('writes the container scrollTop so the target lands at the margin from its top', () => {
        // The scroller itself carries no data-top, so the shared mock above
        // reports its top as 0 — matching the container's own edge.
        const { scroller, utterance } = build(810);
        const scrollTop = trackScrollTop(scroller, 43);

        scrollElementToContainerTop(utterance, 16);

        // 43 (current) + 810 (target top) - 0 (container top) - 16 (margin)
        expect(scrollTop()).toBe(837);
    });

    it('does nothing for an element outside a scroll container', () => {
        document.body.innerHTML = '<span id="orphan" data-top="500"></span>';
        // No scroll container exists to receive a write; the call must not throw.
        expect(() => scrollElementToContainerTop(document.getElementById('orphan')!, 16)).not.toThrow();
    });
});
