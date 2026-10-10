import {
    captureScrollAnchor,
    getScrollContainer,
    nextScrollTopForTargetAtTop,
    nextScrollTopForTargetCentered,
    restoreScrollAnchor,
    revealUtterance,
    scrollElementToContainerTop,
} from '../scrollAnchor';

// Regression guard for #367: saving an utterance mid-segment used to strand the
// editor near the end of the segment. Named .test.tsx so jest runs it under
// jsdom — these helpers are pure DOM, no React.

// jsdom has no layout, so each element reports the top its `data-top` says. An
// element with `data-doc-top` instead sits in the scrolled content: its top is
// that document position less its container's scrollTop.
beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value(this: HTMLElement) {
            const height = Number(this.dataset.height ?? 0);
            const docTop = this.dataset.docTop;
            const top = docTop === undefined
                ? Number(this.dataset.top ?? 0)
                : Number(docTop) - (this.closest<HTMLElement>('[data-scroll-container]')?.scrollTop ?? 0);
            return { top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top } as DOMRect;
        },
    });
});

/**
 * jsdom's own scrollTop is inert, so back it with a plain value. `max` clamps
 * a write the way a browser does at the end of the content.
 */
const trackScrollTop = (el: HTMLElement, initial: number, max = Infinity) => {
    let value = initial;
    let writes = 0;
    Object.defineProperty(el, 'scrollTop', {
        configurable: true,
        get: () => value,
        set: (next: number) => {
            writes += 1;
            value = Math.min(next, max);
        },
    });
    return Object.assign(() => value, { writes: () => writes });
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

describe('nextScrollTopForTargetCentered', () => {
    it('scrolls so the target sits in the middle of the band', () => {
        // Band 100..900 (middle 500), target 2000..2020 (middle 2010): forward by 1510.
        expect(nextScrollTopForTargetCentered(100, 900, 2000, 20, 4000)).toBe(5510);
    });

    it('never asks for a negative scrollTop', () => {
        expect(nextScrollTopForTargetCentered(100, 900, 20, 20, 5)).toBe(0);
    });
});

// Regression guards for the seek path. It used to call
// `scrollIntoView({ block: 'start' })` on the utterance, which put it under the
// segment's sticky header and, in a long transcript, overshot while the
// virtualised segments above it settled.
describe('revealUtterance', () => {
    interface View {
        /** Document position of the utterance; its viewport top follows the scroll. */
        utteranceDocTop: number;
        headerHeight?: number;
        /** Where the segment header sticks: the banner's height on an unverified transcript. */
        headerTop?: number;
        /** The dock's reserved height, which the layout pads under the content. */
        dockClearance?: number;
        scrollHeight?: number;
    }
    const buildView = ({ utteranceDocTop, headerHeight = 0, headerTop = 0, dockClearance = 0, scrollHeight = 100000 }: View) => {
        document.body.innerHTML = `
            <div data-scroll-container id="scroller" data-top="0" data-height="1000">
                <div data-scroll-content style="padding-bottom: ${dockClearance}px">
                    <div role="listitem">
                        <div data-segment-header style="position: sticky; top: ${headerTop}px" data-top="${headerTop}" data-height="${headerHeight}"></div>
                        <span id="utterance" data-doc-top="${utteranceDocTop}" data-height="20"></span>
                    </div>
                </div>
            </div>`;
        const scroller = document.getElementById('scroller')!;
        Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: scrollHeight });
        Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 1000 });
        return { scroller, utterance: document.getElementById('utterance')! };
    };
    /** Queues animation frames instead of running them; returns a runner for the hold's frames. */
    const captureFrames = () => {
        const frames: FrameRequestCallback[] = [];
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            return frames.length;
        });
        return (max = 20) => {
            let ticks = 0;
            while (frames.length > 0 && ticks < max) {
                frames.shift()!(0);
                ticks += 1;
            }
            return ticks;
        };
    };

    beforeEach(() => {
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('centres a target below the fold', () => {
        const { scroller, utterance } = buildView({ utteranceDocTop: 1243 });
        const scrollTop = trackScrollTop(scroller, 43);

        revealUtterance(utterance);

        // Viewport top 1200: 43 + (1200 + 10) - 500.
        expect(scrollTop()).toBe(753);
    });

    it('leaves the container alone when the target is in view', () => {
        const { scroller, utterance } = buildView({ utteranceDocTop: 443 });
        const scrollTop = trackScrollTop(scroller, 43);

        revealUtterance(utterance);

        expect(scrollTop()).toBe(43);
    });

    it('counts a target under the sticky segment header as hidden', () => {
        const { scroller, utterance } = buildView({ utteranceDocTop: 640, headerHeight: 80 });
        const scrollTop = trackScrollTop(scroller, 600);

        revealUtterance(utterance);

        // Viewport top 40, under an 80px header. Band 80..1000 (middle 540), target middle 50: back by 490.
        expect(scrollTop()).toBe(110);
    });

    it('counts the band the header sticks under as covered too', () => {
        const { scroller, utterance } = buildView({ utteranceDocTop: 700, headerHeight: 80, headerTop: 40 });
        const scrollTop = trackScrollTop(scroller, 600);

        revealUtterance(utterance);

        // Viewport top 100 clears the header's own 80px but not the 40px it sticks under.
        // Band 120..1000 (middle 560), target middle 110: back by 450.
        expect(scrollTop()).toBe(150);
    });

    it('counts a target under the playback dock as hidden', () => {
        const { scroller, utterance } = buildView({ utteranceDocTop: 1500, dockClearance: 112 });
        const scrollTop = trackScrollTop(scroller, 600);

        revealUtterance(utterance);

        // Viewport top 900 is inside the pane but under the 112px dock.
        // Band 0..888 (middle 444), target middle 910: forward by 466.
        expect(scrollTop()).toBe(1066);
    });

    it('falls back to scrollIntoView outside a scroll container', () => {
        document.body.innerHTML = '<span id="orphan" data-top="500"></span>';
        const scrollIntoView = jest.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        revealUtterance(document.getElementById('orphan')!);

        expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it('re-centres a target that the settling layout pushes away', () => {
        const run = captureFrames();
        const { scroller, utterance } = buildView({ utteranceDocTop: 1243 });
        const scrollTop = trackScrollTop(scroller, 43);

        revealUtterance(utterance);
        expect(scrollTop()).toBe(753);
        // A segment above it lays out at its real height.
        utterance.dataset.docTop = '1643';
        run(1);

        expect(scrollTop()).toBe(1153);
        expect(scrollTop.writes()).toBe(2);
    });

    it('lets go once the target has kept still', () => {
        const run = captureFrames();
        const { scroller, utterance } = buildView({ utteranceDocTop: 1243 });
        const scrollTop = trackScrollTop(scroller, 43);

        revealUtterance(utterance);
        const ticks = run();

        expect(ticks).toBeLessThan(20);
        expect(scrollTop.writes()).toBe(1);
    });

    it('settles at the end of the transcript instead of re-centring for the whole hold', () => {
        // The browser clamps a scrollTop past the end, and a request the browser
        // clamps used to read as movement on every frame.
        const run = captureFrames();
        const { scroller, utterance } = buildView({ utteranceDocTop: 1243, scrollHeight: 1100 });
        const scrollTop = trackScrollTop(scroller, 0, 100);

        revealUtterance(utterance);
        const ticks = run();

        expect(scrollTop()).toBe(100);
        expect(scrollTop.writes()).toBe(1);
        expect(ticks).toBeLessThan(20);
    });

    it('lets go when the pane scrolls without it', () => {
        const run = captureFrames();
        const { scroller, utterance } = buildView({ utteranceDocTop: 1243 });
        const scrollTop = trackScrollTop(scroller, 43);

        revealUtterance(utterance);
        // A scrollbar drag: the pane moved and the hold wrote nothing.
        scroller.scrollTop = 2000;
        scroller.dispatchEvent(new Event('scroll'));
        utterance.dataset.docTop = '1643';
        run();

        expect(scrollTop()).toBe(2000);
    });

    it('lets go on a wheel, and keeps going through a key a shortcut consumed', () => {
        const run = captureFrames();
        const { scroller, utterance } = buildView({ utteranceDocTop: 1243 });
        const scrollTop = trackScrollTop(scroller, 43);
        const consumeArrowUp = (event: KeyboardEvent) => {
            if (event.key === 'ArrowUp') event.preventDefault();
        };
        window.addEventListener('keydown', consumeArrowUp);
        try {
            revealUtterance(utterance);
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
            utterance.dataset.docTop = '1643';
            run(1);
            // The speed shortcut consumed the key: nothing scrolled, the hold stays.
            expect(scrollTop()).toBe(1153);

            scroller.dispatchEvent(new Event('wheel'));
            utterance.dataset.docTop = '2043';
            run();
            expect(scrollTop()).toBe(1153);
        } finally {
            window.removeEventListener('keydown', consumeArrowUp);
        }
    });

    it('leaves a running hold alone when the next target is in view already', () => {
        const run = captureFrames();
        const { scroller, utterance } = buildView({ utteranceDocTop: 1243 });
        const scrollTop = trackScrollTop(scroller, 43);

        revealUtterance(utterance);
        const neighbour = document.createElement('span');
        neighbour.dataset.docTop = '1300';
        neighbour.dataset.height = '20';
        utterance.parentElement!.appendChild(neighbour);
        revealUtterance(neighbour);
        expect(scrollTop.writes()).toBe(1);
        utterance.dataset.docTop = '1643';
        run(1);

        expect(scrollTop()).toBe(1153);
    });

    it('gives up when its corrections keep reversing', () => {
        // Chrome that reacts to the scroll position would otherwise make it flicker.
        const run = captureFrames();
        const { scroller, utterance } = buildView({ utteranceDocTop: 1243 });
        trackScrollTop(scroller, 43);

        revealUtterance(utterance);
        let ticks = 0;
        for (; ticks < 20; ticks += 1) {
            utterance.dataset.docTop = ticks % 2 === 0 ? '1643' : '1243';
            if (run(1) === 0) break;
        }

        expect(ticks).toBeGreaterThan(2);
        expect(ticks).toBeLessThan(10);
    });
});
