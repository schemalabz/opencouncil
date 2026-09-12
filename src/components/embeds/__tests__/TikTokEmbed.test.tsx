import { render, act, screen } from '@testing-library/react';
import { TikTokEmbed } from '../TikTokEmbed';

// jsdom has no IntersectionObserver. This stub keeps the observed callback, so
// a test decides when the reader scrolls near the video.
let triggers: IntersectionObserverCallback[] = [];
const disconnect = jest.fn();

class IntersectionObserverStub implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: ReadonlyArray<number> = [];
    private readonly callback: IntersectionObserverCallback;

    constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        triggers.push(callback);
    }

    observe() {}
    unobserve() {}
    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }
    // A disconnected observer hears nothing more. Without this, an unmounted
    // component still answers a later scroll and loads a tag it cannot remove.
    disconnect = () => {
        triggers = triggers.filter((t) => t !== this.callback);
        disconnect();
    };
}

beforeEach(() => {
    triggers = [];
    disconnect.mockClear();
    window.IntersectionObserver = IntersectionObserverStub;
});

const scripts = () => document.querySelectorAll('script[src="https://www.tiktok.com/embed.js"]');

afterEach(() => scripts().forEach((s) => s.remove()));

const renderEmbed = () =>
    render(
        <TikTokEmbed videoId="123" cite="https://www.tiktok.com/@opencouncil/video/123">
            <a href="https://www.tiktok.com/@opencouncil">@opencouncil</a>
        </TikTokEmbed>,
    );

/** The only field the component reads off an entry. */
const entry = { isIntersecting: true } as IntersectionObserverEntry;
const approach = () =>
    act(() => triggers.forEach((t) => t([entry], {} as IntersectionObserver)));

describe('TikTokEmbed', () => {
    it('does not load embed.js while the video is far from the viewport', () => {
        renderEmbed();

        expect(scripts()).toHaveLength(0);
    });

    it('loads embed.js as the reader approaches the video', () => {
        renderEmbed();

        approach();

        expect(scripts()).toHaveLength(1);
        expect(disconnect).toHaveBeenCalled();
    });

    it('takes its own tag away on unmount, and leaves the rest alone', () => {
        const first = renderEmbed();
        renderEmbed();
        approach();
        expect(scripts()).toHaveLength(2);

        first.unmount();

        // embed.js guards its own library by element id, so the second tag costs
        // a cached request. Removing a tag the component never created does not
        // cost a request, it costs somebody else their player.
        expect(scripts()).toHaveLength(1);
    });

    it('loads embed.js right away where there is no IntersectionObserver', () => {
        Reflect.deleteProperty(window, 'IntersectionObserver');

        const { unmount } = renderEmbed();

        expect(scripts()).toHaveLength(1);

        unmount();

        expect(scripts()).toHaveLength(0);
    });

    it('runs embed.js again after a remount, so the new blockquote gets scanned', () => {
        const first = renderEmbed();
        approach();
        const firstTag = scripts()[0];
        first.unmount();

        renderEmbed();
        approach();

        // embed.js scans the document when it runs, and the earlier run never saw
        // this blockquote. Only a fresh element re-runs the script.
        expect(scripts()).toHaveLength(1);
        expect(scripts()[0]).not.toBe(firstTag);
    });

    it('gives embed.js the markup it looks for', () => {
        const { container } = renderEmbed();
        const quote = container.querySelector('blockquote');

        expect(quote).toHaveClass('tiktok-embed');
        expect(quote).toHaveAttribute('data-video-id', '123');
    });

    it('keeps the caption as visible fallback until the player replaces it', () => {
        renderEmbed();

        expect(screen.getByRole('link', { name: '@opencouncil' })).toBeVisible();
    });
});
