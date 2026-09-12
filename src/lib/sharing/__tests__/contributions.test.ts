import { PUBLIC_CITY_WHERE } from '@/lib/cityStatus';
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { speakerContribution: { findFirst: jest.fn() }, utterance: { findMany: jest.fn(), findFirst: jest.fn() } } }));
import prisma from '@/lib/db/prisma';
import { getPublicContribution } from '../contributions';

const findContribution = prisma.speakerContribution.findFirst as jest.Mock;
const findReferences = prisma.utterance.findMany as jest.Mock;
const findFirst = prisma.utterance.findFirst as jest.Mock;
const fixture = {
    id: 'contribution', text: 'Πρόταση [πηγή](REF:UTTERANCE:u1) και [άγνωστη](REF:UTTERANCE:bad).', speakerId: null, speakerName: 'Άννα', speaker: null,
    subject: { id: 'subject', name: 'Πλατεία', councilMeeting: { id: 'meeting', cityId: 'city', administrativeBody: { showUnreviewedTranscript: true }, taskStatuses: [] } },
};

describe('public contribution references', () => {
    beforeEach(() => {
        jest.clearAllMocks(); findContribution.mockResolvedValue(fixture); findReferences.mockResolvedValue([{ id: 'u1', startTimestamp: 0 }]); findFirst.mockResolvedValue(null);
    });
    it('enforces release and realm and resolves zero-timestamp sources without a matched person', async () => {
        const result = await getPublicContribution('contribution', 'greece', 'en');
        expect(findContribution.mock.calls[0][0].where).toEqual({ id: 'contribution', subject: { councilMeeting: { released: true, city: { ...PUBLIC_CITY_WHERE, realm: 'greece' } } } });
        expect(result?.referenceLinks).toEqual({ u1: '/en/city/meeting/transcript?t=0#u1' });
        expect(result?.playbackUrl).toBe('/en/city/meeting/transcript?t=0');
        expect(result?.subjectUrl).toBe('/en/city/meeting/subjects/subject?contribution=contribution#contribution-contribution');
        expect(findReferences.mock.calls[0][0]).toMatchObject({ where: { id: { in: ['u1', 'bad'] }, speakerSegment: { cityId: 'city', meetingId: 'meeting' } }, take: 100 });
    });
    it('keeps the summary available while withholding all hidden transcript links/timestamps', async () => {
        findContribution.mockResolvedValue({ ...fixture, subject: { ...fixture.subject, councilMeeting: { ...fixture.subject.councilMeeting, administrativeBody: { showUnreviewedTranscript: false } } } });
        const result = await getPublicContribution('contribution', 'greece', 'el');
        expect(result?.text).toBe(fixture.text);
        expect(result?.referenceLinks).toEqual({});
        expect(result?.playbackUrl).toBeNull();
        expect(findReferences).not.toHaveBeenCalled();
        expect(findFirst).not.toHaveBeenCalled();
    });
    it('caps and deduplicates references before querying', async () => {
        findContribution.mockResolvedValue({ ...fixture, text: Array.from({ length: 120 }, (_, i) => `[source](REF:UTTERANCE:u${i})`).join(' ') });
        await getPublicContribution('contribution', 'greece', 'sr-Latn');
        expect(findReferences.mock.calls[0][0].where.id.in).toHaveLength(100);
        expect(findReferences).toHaveBeenCalledTimes(1);
    });
    it('does not guess a replacement for deleted/unreleased contributions', async () => {
        findContribution.mockResolvedValue(null);
        expect(await getPublicContribution('missing', 'greece', 'en')).toBeNull();
        expect(findReferences).not.toHaveBeenCalled();
    });
});
