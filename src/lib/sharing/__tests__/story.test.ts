jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('next-intl/server', () => ({ getTranslations: jest.fn().mockResolvedValue((key: string) => key) }));
jest.mock('@/lib/sharing/excerpts', () => ({ getPublicExcerpt: jest.fn() }));
jest.mock('@/lib/sharing/contributions', () => ({ getPublicContribution: jest.fn() }));
jest.mock('@/lib/sharing/publicContent', () => ({ getPublicSubject: jest.fn() }));
jest.mock('next/og', () => ({ ImageResponse: jest.fn().mockImplementation((element, options) => ({ element, options })) }));
jest.mock('@/lib/og/sharingAssets', () => ({ SHARING_OG_FONTS: [] }));
jest.mock('@/lib/og/serverAssets', () => ({ LOGO_BLACK_DATA_URI: '' }));

import { ImageResponse } from 'next/og';
import { GET } from '@/app/api/share/story/route';
import { getPublicExcerpt } from '@/lib/sharing/excerpts';
import { getPublicContribution } from '@/lib/sharing/contributions';
import { getPublicSubject } from '@/lib/sharing/publicContent';
import { storyImagePath, storyPreview } from '../story';
import type { ExcerptSelector } from '../excerptSelector';

const selector: ExcerptSelector = { cityId: 'city', meetingId: 'meeting', firstUtteranceId: 'u1', lastUtteranceId: 'u2', textLocale: 'el', digest: 'a'.repeat(64) };
const meeting = { id: 'meeting', cityId: 'city', name: 'Συνεδρίαση', name_en: 'Meeting', dateTime: new Date('2026-09-10'), administrativeBody: { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' }, city: { name: 'Αθήνα', name_en: 'Athens', timezone: 'Europe/Athens' } };
const runs = [{ id: 'u1', text: 'Λόγια Άννας', speakerName: 'Άννα', personId: 'p1', speakerTagId: 'tag1' }, { id: 'u2', text: 'Άγνωστα λόγια', speakerName: null, personId: null, speakerTagId: 'tag2' }];
const excerptUrl = storyImagePath({ type: 'excerpt', selector });
const call = (path: string) => GET(new Request(`https://opencouncil.gr${path}`));
const imageMock = ImageResponse as unknown as jest.Mock;
const excerptMock = getPublicExcerpt as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    excerptMock.mockResolvedValue({ status: 'ok', excerpt: { isReviewed: false, selector, runs, meeting, subject: { name: 'Πλατεία' } } });
    (getPublicContribution as jest.Mock).mockResolvedValue({ id: 'c1', meeting, subject: { name: 'Πλατεία' }, speakerName: 'Άννα', text: '**Περίληψη**.', speakerImage: null });
    (getPublicSubject as jest.Mock).mockResolvedValue({ name: 'Πλατεία', description: '**Σύνοψη**', councilMeeting: meeting });
});

it('renders an unreviewed, attributed excerpt in 1080×1920 without caching', async () => {
    await call(excerptUrl);
    expect(getPublicExcerpt).toHaveBeenCalledWith(selector, 'greece');
    const [element, options] = imageMock.mock.calls[0];
    expect(element.props).toMatchObject({ kind: 'excerpt', warning: 'unreviewedNotice', administrativeBody: 'Δημοτικό Συμβούλιο', city: 'Αθήνα', passages: [{ speakerName: 'Άννα', text: 'Λόγια Άννας' }, { speakerName: 'unknownSpeaker', text: 'Άγνωστα λόγια' }] });
    expect(options).toMatchObject({ width: 1080, height: 1920, headers: { 'Cache-Control': 'private, no-store' } });
});

it('removes the warning only after human review', async () => {
    excerptMock.mockResolvedValue({ status: 'ok', excerpt: { isReviewed: true, selector, runs, meeting } });
    await call(excerptUrl);
    expect(imageMock.mock.calls[0][0].props.warning).toBeUndefined();
});

it('renders contribution summaries separately from verbatim quotes', async () => {
    await call(storyImagePath({ type: 'contribution', id: 'c1', locale: 'en' }));
    expect(getPublicContribution).toHaveBeenCalledWith('c1', 'greece', 'en');
    expect(imageMock.mock.calls[0][0].props).toMatchObject({ kind: 'contribution', title: 'Πλατεία', text: 'Περίληψη.', speakerName: 'Άννα', administrativeBody: 'Municipal Council', summaryLabel: 'summary' });
    expect(imageMock.mock.calls[0][0].props.passages).toBeUndefined();
});

it('checks the complete public subject tuple and realm', async () => {
    await call(storyImagePath({ type: 'subject', cityId: 'city', meetingId: 'meeting', subjectId: 'subject', locale: 'sr-Latn' }));
    expect(getPublicSubject).toHaveBeenCalledWith('city', 'meeting', 'subject', 'greece');
    expect(imageMock.mock.calls[0][0].props).toMatchObject({ kind: 'subject', title: 'Πλατεία', text: 'Σύνοψη', summaryLabel: 'summary' });
});

it.each(['&startOffset=0', '&type=subject', '&digest=bad'])('rejects ambiguous or partial selectors: %s', async suffix => {
    const response = await call(`${excerptUrl}${suffix}`);
    expect(response.status).toBe(400);
    expect(imageMock).not.toHaveBeenCalled();
    expect(excerptMock).not.toHaveBeenCalled();
});

it.each([['source-changed', 409], ['unavailable', 404], ['invalid', 404]])('does not return shareable image bytes for %s', async (status, code) => {
    excerptMock.mockResolvedValue({ status });
    const response = await call(excerptUrl);
    expect(response.status).toBe(code);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ code: status });
    expect(imageMock).not.toHaveBeenCalled();
});

it('does not export a private contribution or subject', async () => {
    (getPublicContribution as jest.Mock).mockResolvedValue(null);
    (getPublicSubject as jest.Mock).mockResolvedValue(null);
    expect((await call(storyImagePath({ type: 'contribution', id: 'c1', locale: 'en' }))).status).toBe(404);
    expect((await call(storyImagePath({ type: 'subject', cityId: 'city', meetingId: 'meeting', subjectId: 'subject', locale: 'en' }))).status).toBe(404);
    expect(imageMock).not.toHaveBeenCalled();
});

it('bounds previews at a word boundary and preserves unicode and complete short text', () => {
    expect(storyPreview('A complete utterance.', 30)).toBe('A complete utterance.');
    expect(storyPreview('This sentence is too long to fit on the image.', 25)).toBe('This sentence is too…');
    expect(Array.from(storyPreview('🙂'.repeat(2000), 100))).toHaveLength(100);
    expect(storyPreview(' one\n two ', 20)).toBe('one two');
});
