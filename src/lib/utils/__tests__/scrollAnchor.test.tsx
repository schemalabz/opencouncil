import { captureScrollAnchor, getScrollContainer, restoreScrollAnchor } from '../scrollAnchor';

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
