import { aboutVideo } from '@/lib/landing/aboutVideo';

describe('aboutVideo', () => {
    it('offers the Greek film on the Greek realm, from the CDN', () => {
        const video = aboutVideo('greece');
        expect(video?.src).toBe('https://data.opencouncil.gr/explain/oc-about-v1.mp4');
        expect(video?.poster).toMatch(/^https:\/\/data\.opencouncil\.gr\/explain\//);
    });

    it('offers nothing on the other realms', () => {
        for (const realm of ['france', 'cyprus', 'serbia'] as const) expect(aboutVideo(realm)).toBeNull();
    });
});
