jest.mock('next/headers', () => ({ headers: jest.fn() }));
jest.mock('@/lib/realm.server', () => ({ getRealmBaseUrlFromRequest: jest.fn().mockResolvedValue('https://opencouncil.gr') }));

import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';
import robots from '../robots';
import { transcriptExcerptPath, type ExcerptSelector } from '@/lib/sharing/excerptSelector';

type Rule = Exclude<MetadataRoute.Robots['rules'], unknown[]>;
const selector: ExcerptSelector = { cityId: 'athens', meetingId: 'm1', firstUtteranceId: 'u1', lastUtteranceId: 'u2', textLocale: 'el', digest: 'a'.repeat(64), maxDrift: 500 };

// Google's reading: the longest matching pattern decides, and allow wins a tie.
function crawlable(rule: Rule, url: string) {
    const matches = (pattern: string) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}`).test(url);
    const longest = (patterns: string | string[] = []) => Math.max(-1, ...[patterns].flat().filter(matches).map(pattern => pattern.length));
    return longest(rule.allow) >= longest(rule.disallow);
}
const rulesFor = async (host: string) => {
    (headers as jest.Mock).mockResolvedValue(new Headers({ host }));
    return (await robots()).rules as Rule;
};

describe('robots rules', () => {
    it('lets link previews read a shared excerpt but keeps raw transcripts out', async () => {
        const rule = await rulesFor('opencouncil.gr');
        expect(crawlable(rule, transcriptExcerptPath(selector))).toBe(true);
        expect(crawlable(rule, transcriptExcerptPath({ ...selector, textLocale: 'en' }))).toBe(true);
        expect(crawlable(rule, '/athens/m1/transcript')).toBe(false);
        expect(crawlable(rule, '/athens/m1/transcript?t=12')).toBe(false);
        expect(crawlable(rule, '/athens/m1/subjects/s1')).toBe(true);
    });
    it('keeps every crawler off a PR preview', async () => {
        const rule = await rulesFor('pr-819.opencouncil.dev');
        expect(crawlable(rule, transcriptExcerptPath(selector))).toBe(false);
    });
});
