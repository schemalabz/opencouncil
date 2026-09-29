import { aboutVideo } from '@/lib/landing/aboutVideo';

describe('aboutVideo', () => {
    it('offers the Greek film on the Greek realm in Greek, from the CDN', () => {
        const video = aboutVideo('greece', 'el');
        expect(video?.src).toBe('https://data.opencouncil.gr/explain/oc-about-v1.mp4');
        expect(video?.poster).toMatch(/^https:\/\/data\.opencouncil\.gr\/explain\//);
    });

    it('offers nothing on the other realms', () => {
        for (const realm of ['france', 'cyprus', 'serbia'] as const) expect(aboutVideo(realm, 'el')).toBeNull();
    });

    it('offers nothing to a reader of the Greek realm in another language', () => {
        // the film has no subtitles, so an /en reader of opencouncil.gr cannot follow it
        for (const locale of ['en', 'fr', 'sr']) expect(aboutVideo('greece', locale)).toBeNull();
    });
});
