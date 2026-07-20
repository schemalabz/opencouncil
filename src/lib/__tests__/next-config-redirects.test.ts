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
});
