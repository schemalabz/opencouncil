/** @jest-environment node */
// Next's own rewrite matching (see next/dist/server/lib/router-utils/filesystem.js),
// so these tests check what the router does with the rules, not a copy of it.
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination';
import { modifyRouteRegex } from 'next/dist/lib/redirect-status';
import { normalizeRepeatedSlashes } from 'next/dist/shared/lib/utils';
import { VIDEO_LINK_ROUTE, YOUTUBE_HOSTS, videoLinkRewrites } from '../videoLinkRewrites.mjs';
import { parseYouTubeLink } from '../youtube';

const ID = 'dQw4w9WgXcQ';

/** The path the route receives for `url`, or null when no rule rewrites it. */
function rewrite(url: string): string | null {
    const [pathname] = normalizeRepeatedSlashes(url).split('?');
    for (const rule of videoLinkRewrites()) {
        const match = getPathMatch(rule.source, { strict: true, removeUnnamedParams: true, regexModifier: modifyRouteRegex });
        const params = match(pathname);
        if (params) {
            return prepareDestination({ destination: rule.destination, params, query: {}, appendParamsToQuery: false }).newUrl;
        }
    }
    return null;
}

describe('videoLinkRewrites', () => {
    it.each([
        [`/https://www.youtube.com/watch?v=${ID}&t=90`, 90],
        [`/http://youtube.com/watch?v=${ID}&t=90`, 90],
        [`/https://m.youtube.com/watch?v=${ID}&t=90`, 90],
        [`/https://youtu.be/${ID}?si=abc&t=90`, 90],
        [`/https://www.youtube.com/live/${ID}?t=90`, 90],
        [`/https://www.youtube.com/shorts/${ID}`, null],
        [`/youtu.be/${ID}?t=90`, 90],
        [`/www.youtube.com/watch?v=${ID}&t=90`, 90],
    ])('sends %s to the route, which resolves it', (url, startSeconds) => {
        const path = rewrite(url);
        expect(path).toMatch(new RegExp(`^${VIDEO_LINK_ROUTE}/`));

        // The route rebuilds the link from its segments plus the original query string.
        const search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
        expect(parseYouTubeLink(path!.slice(VIDEO_LINK_ROUTE.length + 1) + search)).toEqual({ videoId: ID, startSeconds });
    });

    it.each(YOUTUBE_HOSTS)('only lists hosts whose links the parser reads: %s', (host) => {
        const links = [`https://${host}/watch?v=${ID}`, `https://${host}/${ID}`];
        expect(links.some(link => parseYouTubeLink(link)?.videoId === ID)).toBe(true);
    });

    it.each([
        '/',
        '/athens',
        '/athens/jan21_2026/transcript',
        '/en/athens',
        '/about',
        '/search',
        '/yt',
        '/favicon.ico',
        '/robots.txt',
        '/https://example.com/watch?v=x',
        '/example.com/youtube.com',
        '/youtube.company.com/x',
        '/youtu-be/x',
    ])('leaves %s alone', (url) => {
        expect(rewrite(url)).toBeNull();
    });
});
