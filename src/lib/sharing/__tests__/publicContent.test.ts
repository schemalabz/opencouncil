import { PUBLIC_CITY_WHERE } from '@/lib/cityStatus';
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { councilMeeting: { findFirst: jest.fn() }, subject: { findFirst: jest.fn() } } }));
import prisma from '@/lib/db/prisma';
import { getPublicMeeting, getPublicSubject, transcriptIsPublic, publicSubjectSelect, TRANSCRIPT_PUBLIC_WHERE, type PublicMeeting } from '../publicContent';

describe('public sharing boundary', () => {
    it('scopes meeting access by city, release and request realm without editor overrides', async () => {
        await getPublicMeeting('city', 'meeting', 'france');
        expect(prisma.councilMeeting.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { cityId: 'city', id: 'meeting', released: true, city: { ...PUBLIC_CITY_WHERE, realm: 'france' } } }));
    });
    it('requires the exact subject tuple and does not fetch private or transcript relations', async () => {
        await getPublicSubject('city', 'meeting', 'subject', 'greece');
        expect(prisma.subject.findFirst).toHaveBeenCalledWith({ where: { id: 'subject', cityId: 'city', councilMeetingId: 'meeting', councilMeeting: { released: true, city: { ...PUBLIC_CITY_WHERE, realm: 'greece' } } }, select: publicSubjectSelect });
        expect(JSON.stringify(publicSubjectSelect)).not.toMatch(/votes|attendance|speakerSegments|highlights|geometry/);
    });
    it('honors the existing human-review visibility contract', () => {
        const meeting = { administrativeBody: { showUnreviewedTranscript: false, type: 'council' }, taskStatuses: [] } as unknown as PublicMeeting;
        expect(transcriptIsPublic(meeting)).toBe(false);
        expect(transcriptIsPublic({ ...meeting, taskStatuses: [{ id: 'review' }] })).toBe(true);
        expect(transcriptIsPublic({ ...meeting, administrativeBody: null })).toBe(true);
    });
    // A youth council's pipeline writes no review row: the setting cannot
    // keep its transcript from the excerpts, as it does not from the page.
    it('shows the transcript of a body whose pipeline runs unattended, review or not (#829)', () => {
        const youth = { administrativeBody: { showUnreviewedTranscript: false, type: 'youthCouncil' }, taskStatuses: [] } as unknown as PublicMeeting;
        expect(transcriptIsPublic(youth)).toBe(true);
        expect(TRANSCRIPT_PUBLIC_WHERE.OR).toContainEqual({ administrativeBody: { type: { in: ['youthCouncil'] } } });
    });
});
