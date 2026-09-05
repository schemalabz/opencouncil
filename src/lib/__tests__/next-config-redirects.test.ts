// Pins the matching semantics of the redirect `source` patterns in
// next.config.mjs — in particular the negative lookahead that keeps the
// phantom-/meetings/ redirects away from the real /api/meetings/* routes,
// which is subtle enough that it has already been (wrongly) flagged in review.
//
// The config can't be imported here (ESM + env validation at load), so the
// patterns are extracted from the file's text and compiled with Next's own
// bundled path-to-regexp — the test always exercises whatever is actually in
// next.config.mjs.
import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getPathMatch } = require('next/dist/shared/lib/router/utils/path-match');

const configText = fs.readFileSync(path.join(__dirname, '../../../next.config.mjs'), 'utf8');
const redirectsBlock = configText.slice(
    configText.indexOf('async redirects()'),
    configText.indexOf('async rewrites()'),
);
const sources = [...redirectsBlock.matchAll(/source:\s*'([^']+)'/g)].map((m) => m[1]);

const matchesAnyRedirect = (pathname: string) =>
    sources.some((source) => getPathMatch(source)(pathname) !== false);

describe('next.config.mjs redirect sources', () => {
    it('extracts the redirect patterns from the config', () => {
        expect(sources).toEqual(expect.arrayContaining(['/map', '/petitions']));
        expect(sources.filter((s) => s.includes('/meetings/'))).toHaveLength(4);
    });

    it('redirects the phantom /meetings/ urls from the old sitemap', () => {
        expect(matchesAnyRedirect('/athens/meetings/jan15_2024')).toBe(true);
        expect(matchesAnyRedirect('/athens/meetings/jan15_2024/subjects/abc')).toBe(true);
        expect(matchesAnyRedirect('/en/athens/meetings/jan15_2024')).toBe(true);
        expect(matchesAnyRedirect('/fr/athens/meetings/jan15_2024/subjects/abc')).toBe(true);
        expect(matchesAnyRedirect('/sr/athens/meetings/jan15_2024')).toBe(true);
        expect(matchesAnyRedirect('/lat/athens/meetings/jan15_2024')).toBe(true);
    });

    it('leaves the city meetings tab alone', () => {
        // /:cityId/meetings is a real page. The phantom-redirect patterns require a
        // :meetingId segment after /meetings/, so they must not swallow the listing
        // itself — otherwise the tab 301s to the city page.
        expect(matchesAnyRedirect('/athens/meetings')).toBe(false);
        expect(matchesAnyRedirect('/en/athens/meetings')).toBe(false);
        expect(matchesAnyRedirect('/lat/athens/meetings')).toBe(false);
    });

    it('keeps the hardcoded locale alternations in sync with the shared prefix set', () => {
        // next.config.mjs can't import TS, so its regexes inline the locale
        // URL prefixes. This pins them to src/i18n/config.ts.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { localePrefixPattern } = require('../../i18n/config');
        for (const source of sources.filter((s) => s.includes(':locale('))) {
            expect(source).toContain(`:locale(${localePrefixPattern})`);
        }
        for (const source of sources.filter((s) => s.includes('(?!api/'))) {
            const expected = `(?!api/|${localePrefixPattern.split('|').join('/|')}/)`;
            expect(source).toContain(expected);
        }
    });

    it('does not touch the real /api/meetings/* routes', () => {
        // The (?!api/|...) lookahead evaluates against the raw remaining path
        // at the param position — 'api/meetings/…' — not the isolated segment.
        expect(matchesAnyRedirect('/api/meetings/upcoming')).toBe(false);
    });

    it('does not touch real app routes', () => {
        expect(matchesAnyRedirect('/athens')).toBe(false);
        expect(matchesAnyRedirect('/athens/jan15_2024')).toBe(false);
        expect(matchesAnyRedirect('/athens/jan15_2024/subjects/abc')).toBe(false);
    });

    it('redirects the removed /chat page (bare and locale-prefixed)', () => {
        expect(matchesAnyRedirect('/chat')).toBe(true);
        expect(matchesAnyRedirect('/el/chat')).toBe(true);
        expect(matchesAnyRedirect('/en/chat')).toBe(true);
        expect(matchesAnyRedirect('/fr/chat')).toBe(true);
        expect(matchesAnyRedirect('/sr/chat')).toBe(true);
        expect(matchesAnyRedirect('/lat/chat')).toBe(true);
        // the MCP endpoint and page must not be redirected
        expect(matchesAnyRedirect('/mcp')).toBe(false);
        expect(matchesAnyRedirect('/mcp/mcp_token123')).toBe(false);
    });
});
