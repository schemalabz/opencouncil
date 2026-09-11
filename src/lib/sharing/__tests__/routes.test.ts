jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn().mockResolvedValue('greece'), getMetadataBaseFromRequest: jest.fn().mockResolvedValue('https://pr-123.opencouncil.dev'), getRealmBaseUrlFromRequest: jest.fn().mockResolvedValue('https://opencouncil.gr') }));
jest.mock('next-intl/server', () => ({ getTranslations: jest.fn().mockResolvedValue((key: string, values?: { count: number }) => values ? `${key}:${values.count}` : key) }));
jest.mock('@/lib/sharing/excerpts', () => ({ getPublicExcerpt: jest.fn() }));
jest.mock('@/lib/sharing/contributions', () => ({ getPublicContribution: jest.fn() }));
jest.mock('@/components/sharing/SharedExcerpt', () => ({ SharedExcerpt: jest.fn() }));
jest.mock('next/og', () => ({ ImageResponse: jest.fn().mockImplementation((element, options) => ({ element, options })) }));
jest.mock('@/lib/og/serverAssets', () => ({ OG_FONTS: [], LOGO_BLACK_DATA_URI: '' }));
jest.mock('@/lib/og/sharingAssets', () => ({ SHARING_OG_FONTS: [] }));

jest.mock('next/navigation', () => ({ redirect: jest.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }), notFound: jest.fn(() => { throw new Error('NOT_FOUND'); }) }));
jest.mock('@/components/meetings/subject/subject', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/components/analytics/SubjectReadTracker', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/lib/getMeetingData', () => ({ getMeetingDataCached: jest.fn(), getSubjectFromMeetingCached: jest.fn() }));
jest.mock('@/lib/utils/hreflang', () => ({ buildCanonicalAlternates: jest.fn(async (path: string) => ({ canonical: `https://opencouncil.gr${path}` })) }));
jest.mock('@/lib/seo/subjectStructuredData', () => ({ buildSubjectStructuredData: jest.fn(() => ({})), serializeStructuredData: jest.fn(() => '{}') }));

import { ImageResponse } from 'next/og';
import { getMeetingDataCached, getSubjectFromMeetingCached } from '@/lib/getMeetingData';
import Subject from '@/components/meetings/subject/subject';
import SubjectPage, { generateMetadata as subjectMetadata } from '@/app/[locale]/(city)/[cityId]/(meetings)/[meetingId]/subjects/[subjectId]/page';
import { getPublicExcerpt } from '@/lib/sharing/excerpts';
import { getPublicContribution } from '@/lib/sharing/contributions';
import { generateMetadata as excerptMetadata } from '@/app/[locale]/(sharing)/share/excerpt/page';
import ContributionPage, { generateMetadata as contributionMetadata } from '@/app/[locale]/(sharing)/share/contribution/[contributionId]/page';
import { GET as excerptImage } from '@/app/api/og/excerpt/route';
import { GET as contributionImage } from '@/app/api/og/contribution/route';
import { serializeExcerptSelector, type ExcerptSelector } from '../excerptSelector';

const selector: ExcerptSelector = { cityId: 'city', meetingId: 'meeting', firstUtteranceId: 'u1', lastUtteranceId: 'u2', textLocale: 'el', digest: 'a'.repeat(64) };
const meeting = { id: 'meeting', cityId: 'city', name: 'Συνεδρίαση', name_en: 'Meeting', dateTime: new Date('2026-09-10'), administrativeBody: { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' }, city: { name: 'Αθήνα', name_en: 'Athens', timezone: 'Europe/Athens' } };
const runs = [{ id: 'u1', text: 'Λόγια Άννας', speakerName: 'Άννα', personId: 'p1', speakerTagId: 'tag1' }, { id: 'u2', text: 'Λόγια Νίκου', speakerName: 'Νίκος', personId: 'p2', speakerTagId: 'tag2' }];
const resolveExcerpt = getPublicExcerpt as jest.Mock;
const resolveContribution = getPublicContribution as jest.Mock;

describe('server-rendered social preview contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resolveExcerpt.mockResolvedValue({ status: 'ok', excerpt: { isReviewed: true, selector, runs, meeting, subject: { name: 'Πλατεία' } } });
        (getSubjectFromMeetingCached as jest.Mock).mockResolvedValue({ id: 'subject', name: 'Πλατεία', description: 'Public discussion.', contextCitationUrls: [] });
        (getMeetingDataCached as jest.Mock).mockResolvedValue({ meeting, city: meeting.city });
        resolveContribution.mockResolvedValue({ id: 'c1', text: '**Περίληψη**.', subject: { id: 'subject', name: 'Πλατεία' }, speakerName: 'Άννα', meeting, subjectUrl: '/en/city/meeting/subjects/subject?contribution=c1#contribution-c1' });
    });
    it('puts complete selection-specific image URLs in server metadata and preserves multi-speaker attribution', async () => {
        const metadata = await excerptMetadata({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve(Object.fromEntries(serializeExcerptSelector(selector))) });
        expect(metadata.title).toBe('excerpt · speakerCount:2');
        expect(metadata.description).toContain('«Λόγια Άννας»\n— Άννα');
        expect(metadata.description).toContain('«Λόγια Νίκου»\n— Νίκος');
        expect(metadata.openGraph?.images).toEqual([{ url: `https://pr-123.opencouncil.dev/api/og/excerpt?${serializeExcerptSelector(selector)}`, width: 1200, height: 630 }]);
        expect(metadata.robots).toEqual({ index: false, follow: true });
    });
    it('bounds metadata for long passages while preserving each preview speaker', async () => {
        resolveExcerpt.mockResolvedValue({ status: 'ok', excerpt: { isReviewed: true, selector, meeting, runs: runs.map(run => ({ ...run, text: run.text.repeat(1000) })), subject: { name: 'Πλατεία' } } });
        const metadata = await excerptMetadata({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve(Object.fromEntries(serializeExcerptSelector(selector))) });
        expect(metadata.description!.length).toBeLessThanOrEqual(620);
        expect(metadata.description).toContain('…»\n— Άννα');
        expect(metadata.description).toContain('…»\n— Νίκος');
    });
    it('never puts changed or unavailable content into metadata', async () => {
        resolveExcerpt.mockResolvedValue({ status: 'source-changed' });
        const metadata = await excerptMetadata({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve(Object.fromEntries(serializeExcerptSelector(selector))) });
        expect(metadata.description).toBeUndefined();
        expect(metadata.openGraph?.images).toEqual([]);
        resolveContribution.mockResolvedValue(null);
        const missing = await contributionMetadata({ params: Promise.resolve({ locale: 'en', contributionId: 'c1' }) });
        expect(missing.description).toBeUndefined();
        expect(missing.openGraph?.images).toEqual([]);
    });
    it('labels summaries and emits a contribution-specific image URL', async () => {
        const metadata = await contributionMetadata({ params: Promise.resolve({ locale: 'en', contributionId: 'c1' }) });
        expect(metadata.description).toBe('summary: Περίληψη.');
        expect(metadata.openGraph?.images).toEqual([{ url: 'https://pr-123.opencouncil.dev/api/og/contribution?id=c1&locale=en', width: 1200, height: 630 }]);
    });
    it('renders distinct named excerpt passages and a 1200×630 no-store image', async () => {
        await excerptImage(new Request(`https://example.test/api/og/excerpt?${serializeExcerptSelector(selector)}`));
        const [element, options] = (ImageResponse as unknown as jest.Mock).mock.calls[0];
        expect(element.props.passages).toEqual([{ speakerName: 'Άννα', text: 'Λόγια Άννας' }, { speakerName: 'Νίκος', text: 'Λόγια Νίκου' }]);
        expect(element.props.administrativeBody).toBe('Δημοτικό Συμβούλιο');
        expect(options).toMatchObject({ width: 1200, height: 630, headers: { 'Cache-Control': 'private, no-store' } });
    });
    it('localizes the administrative body independently of city/date on contribution images', async () => {
        await contributionImage(new Request('https://example.test/api/og/contribution?id=c1&locale=en'));
        const [element] = (ImageResponse as unknown as jest.Mock).mock.calls[0];
        expect(element.props.administrativeBody).toBe('Municipal Council');
        expect(element.props.context).toContain('Athens');
        expect(element.props.context).not.toContain('Municipal Council');
    });
    it('omits absent administrative bodies on either preview', async () => {
        const noBody = { ...meeting, administrativeBody: null };
        resolveExcerpt.mockResolvedValue({ status: 'ok', excerpt: { isReviewed: true, selector, runs, meeting: noBody, subject: { name: 'Πλατεία' } } });
        resolveContribution.mockResolvedValue({ id: 'c1', text: 'Περίληψη.', subject: { name: 'Πλατεία' }, speakerName: 'Άννα', meeting: noBody });
        await excerptImage(new Request(`https://example.test/api/og/excerpt?${serializeExcerptSelector(selector)}`));
        await contributionImage(new Request('https://example.test/api/og/contribution?id=c1&locale=en'));
        for (const [element] of (ImageResponse as unknown as jest.Mock).mock.calls) expect(element.props.administrativeBody).toBeUndefined();
    });
    it('carries the AI review warning in excerpt metadata and OG, then removes it after review', async () => {
        resolveExcerpt.mockResolvedValue({ status: 'ok', excerpt: { isReviewed: false, selector, runs, meeting, subject: { name: 'Πλατεία' } } });
        const props = { params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve(Object.fromEntries(serializeExcerptSelector(selector))) };
        const metadata = await excerptMetadata(props);
        expect(metadata.description).toMatch(/^unreviewedNotice\n\n/);
        expect(metadata.description).toContain('«Λόγια Άννας»');
        await excerptImage(new Request(`https://example.test/api/og/excerpt?${serializeExcerptSelector(selector)}`));
        expect((ImageResponse as unknown as jest.Mock).mock.calls.at(-1)[0].props.label).toBe('unreviewedLabel');
        resolveExcerpt.mockResolvedValue({ status: 'ok', excerpt: { isReviewed: true, selector, runs, meeting, subject: { name: 'Πλατεία' } } });
        expect((await excerptMetadata(props)).description).not.toContain('unreviewedNotice');
        await excerptImage(new Request(`https://example.test/api/og/excerpt?${serializeExcerptSelector(selector)}`));
        expect((ImageResponse as unknown as jest.Mock).mock.calls.at(-1)[0].props.label).toBe('excerpt');
    });
    it('uses neutral images without attribution for invalid/hidden sources', async () => {
        resolveExcerpt.mockResolvedValue({ status: 'unavailable' });
        await excerptImage(new Request(`https://example.test/api/og/excerpt?${serializeExcerptSelector(selector)}`));
        resolveContribution.mockResolvedValue(null);
        await contributionImage(new Request('https://example.test/api/og/contribution?id=c1&locale=en'));
        for (const [element, options] of (ImageResponse as unknown as jest.Mock).mock.calls) {
            expect(element.props.text).toBe('unavailableTitle');
            expect(element.props.attribution).toBeUndefined();
            expect(element.props.administrativeBody).toBeUndefined();
            expect(options.headers['Cache-Control']).toBe('private, no-store');
        }
    });
    it('redirects legacy contribution links to their real subject', async () => {
        await expect(ContributionPage({ params: Promise.resolve({ locale: 'en', contributionId: 'c1' }) })).rejects.toThrow('REDIRECT:/en/city/meeting/subjects/subject?contribution=c1#contribution-c1');
    });

    it('uses the selected contribution preview on the full subject with its ordinary canonical', async () => {
        const props = { params: Promise.resolve({ locale: 'en', cityId: 'city', meetingId: 'meeting', subjectId: 'subject' }), searchParams: Promise.resolve({ contribution: 'c1' }) };
        const metadata = await subjectMetadata(props);
        expect(metadata.title).toBe('Άννα · Πλατεία');
        expect(metadata.openGraph?.images).toEqual([{ url: 'https://pr-123.opencouncil.dev/api/og/contribution?id=c1&locale=en', width: 1200, height: 630 }]);
        expect(metadata.alternates?.canonical).toBe('https://opencouncil.gr/city/meeting/subjects/subject');
        const page = await SubjectPage(props);
        expect(page.props.children.find((child: React.ReactElement) => child.type === Subject).props.highlightedContributionId).toBe('c1');
    });

    it.each(['subject', 'meeting', 'city'])('ignores a contribution from another %s in subject metadata and highlighting', async (mismatch) => {
        resolveContribution.mockResolvedValue({ id: 'c1', subject: { id: mismatch === 'subject' ? 'other' : 'subject' }, meeting: { id: mismatch === 'meeting' ? 'other' : 'meeting', cityId: mismatch === 'city' ? 'other' : 'city' } });
        const props = { params: Promise.resolve({ locale: 'en', cityId: 'city', meetingId: 'meeting', subjectId: 'subject' }), searchParams: Promise.resolve({ contribution: 'c1' }) };
        const metadata = await subjectMetadata(props);
        expect(metadata.title).toBe('Athens - Πλατεία | OpenCouncil');
        expect(metadata.openGraph?.images).toBeUndefined();
        const page = await SubjectPage(props);
        expect(page.props.children.find((child: React.ReactElement) => child.type === Subject).props.highlightedContributionId).toBeUndefined();
    });

    it('leaves missing/private or repeated contribution parameters on the ordinary subject', async () => {
        const params = Promise.resolve({ locale: 'en', cityId: 'city', meetingId: 'meeting', subjectId: 'subject' });
        resolveContribution.mockResolvedValue(null);
        expect((await subjectMetadata({ params, searchParams: Promise.resolve({ contribution: 'missing' }) })).openGraph?.images).toBeUndefined();
        resolveContribution.mockClear();
        await subjectMetadata({ params, searchParams: Promise.resolve({ contribution: ['c1', 'c2'] }) });
        expect(resolveContribution).not.toHaveBeenCalled();
    });

});
