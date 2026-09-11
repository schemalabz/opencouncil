jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { utterance: { findMany: jest.fn(), findFirst: jest.fn() } } }));
jest.mock('@/lib/db/sharing/publicContent', () => ({ getPublicMeeting: jest.fn(), transcriptIsPublic: jest.fn() }));
import prisma from '@/lib/db/prisma';
import { getPublicMeeting, transcriptIsPublic } from '@/lib/db/sharing/publicContent';
import { getPublicExcerpt } from '../excerpts';
import { digestExcerpt, type ExcerptSelector } from '../excerptSelector';

const query = prisma.utterance.findMany as jest.Mock;
const source = { id: 'u1', text: 'Η πλατεία.', startTimestamp: 0, speakerSegmentId: 'seg', discussionSubject: { id: 's', name: 'Πλατεία' }, speakerSegment: { id: 'seg', startTimestamp: 0, speakerTag: { id: 'tag', personId: 'p', person: { name: 'Άννα', name_en: 'Anna' } } } };
const selector: ExcerptSelector = { cityId: 'city', meetingId: 'meeting', firstUtteranceId: 'u1', lastUtteranceId: 'u1', textLocale: 'el', digest: '' };

describe('bounded public excerpt reconstruction', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        (getPublicMeeting as jest.Mock).mockResolvedValue({ id: 'meeting', taskStatuses: [{ id: 'review' }] });
        (transcriptIsPublic as jest.Mock).mockReturnValue(true);
        query.mockResolvedValue([source]);
        selector.digest = await digestExcerpt([{ id: 'u1', text: source.text, speakerTagId: 'tag', personId: 'p', speakerName: 'Άννα' }]);
    });
    it('reconstructs complete utterance text with bounded same-meeting queries and zero timestamps', async () => {
        const result = await getPublicExcerpt(selector, 'greece');
        expect(result.status).toBe('ok');
        if (result.status !== 'ok') throw new Error('Expected public excerpt');
        expect(result.excerpt.runs[0].text).toBe(source.text);
        expect(result.excerpt.startTimestamp).toBe(0);
        expect(result.excerpt.isReviewed).toBe(true);
        expect(result.excerpt.before).toBe('');
        expect(result.excerpt.after).toBe('');
        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[0][0]).toMatchObject({ where: { speakerSegment: { cityId: 'city', meetingId: 'meeting' } }, take: 2 });
        expect(query.mock.calls[1][0]).toMatchObject({ take: 41, orderBy: [{ speakerSegment: { startTimestamp: 'asc' } }, { speakerSegment: { id: 'asc' } }, { startTimestamp: 'asc' }, { id: 'asc' }] });
    });
    it('updates the review notice without changing the quote or invalidating its digest', async () => {
        (getPublicMeeting as jest.Mock).mockResolvedValue({ id: 'meeting', taskStatuses: [] });
        const unreviewed = await getPublicExcerpt(selector, 'greece');
        expect(unreviewed.status).toBe('ok');
        if (unreviewed.status !== 'ok') throw new Error('Expected publicly eligible excerpt');
        expect(unreviewed.excerpt.isReviewed).toBe(false);
        (getPublicMeeting as jest.Mock).mockResolvedValue({ id: 'meeting', taskStatuses: [{ id: 'review' }] });
        const reviewed = await getPublicExcerpt(selector, 'greece');
        expect(reviewed.status).toBe('ok');
        if (reviewed.status !== 'ok') throw new Error('Expected reviewed excerpt');
        expect(reviewed.excerpt.isReviewed).toBe(true);
        expect(reviewed.excerpt.selector).toEqual(unreviewed.excerpt.selector);
        expect(reviewed.excerpt.runs).toEqual(unreviewed.excerpt.runs);
    });
    it('does not read text for unreleased, foreign-realm or hidden unreviewed meetings', async () => {
        (getPublicMeeting as jest.Mock).mockResolvedValueOnce(null);
        expect(await getPublicExcerpt(selector, 'france')).toEqual({ status: 'unavailable' });
        (transcriptIsPublic as jest.Mock).mockReturnValue(false);
        expect(await getPublicExcerpt(selector, 'greece')).toEqual({ status: 'unavailable' });
        expect(query).not.toHaveBeenCalled();
    });
    it('returns source-changed for corrected text, speaker attribution and missing/cross-meeting endpoints', async () => {
        query.mockResolvedValue([{ ...source, text: 'Η πλατεία!' }]);
        expect((await getPublicExcerpt(selector, 'greece')).status).toBe('source-changed'); // Every word in the selected utterance belongs to the quote.
        query.mockResolvedValue([{ ...source, text: 'Η ΠΛΑΤΕΙΑ.' }]);
        expect((await getPublicExcerpt(selector, 'greece')).status).toBe('source-changed');
        query.mockResolvedValue([{ ...source, speakerSegment: { ...source.speakerSegment, speakerTag: { ...source.speakerSegment.speakerTag, person: { name: 'Νίκος', name_en: 'Nikos' } } } }]);
        expect((await getPublicExcerpt(selector, 'greece')).status).toBe('source-changed');
        query.mockResolvedValue([]);
        expect((await getPublicExcerpt(selector, 'greece')).status).toBe('source-changed');
    });
    it('rejects overflow or reversed selected ranges without returning text', async () => {
        query.mockResolvedValueOnce([source]).mockResolvedValueOnce(Array.from({ length: 41 }, () => source));
        expect(await getPublicExcerpt(selector, 'greece')).toEqual({ status: 'invalid' });
        query.mockResolvedValueOnce([source]).mockResolvedValueOnce([]);
        expect(await getPublicExcerpt(selector, 'greece')).toEqual({ status: 'invalid' });
    });
    it('adds at most one adjacent utterance per side for a full saved utterance', async () => {
        const findNeighbor = prisma.utterance.findFirst as jest.Mock;
        findNeighbor.mockResolvedValueOnce({ text: 'Προηγούμενο.' }).mockResolvedValueOnce({ text: 'Επόμενο.' });
        const full = { ...selector, digest: await digestExcerpt([{ id: source.id, text: source.text, speakerTagId: 'tag', personId: 'p', speakerName: 'Άννα' }]) };
        const result = await getPublicExcerpt(full, 'greece');
        expect(result.status === 'ok' && result.excerpt.before).toBe('Προηγούμενο.');
        expect(result.status === 'ok' && result.excerpt.after).toBe('Επόμενο.');
        expect(findNeighbor).toHaveBeenCalledTimes(2);
        expect(findNeighbor.mock.calls.every(([args]) => args.where.speakerSegmentId === 'seg' && Object.keys(args.select).join() === 'text')).toBe(true);
    });
});
