import { PUBLIC_CITY_WHERE } from '@/lib/cityStatus';
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { councilMeeting: { findFirst: jest.fn(), findUnique: jest.fn() }, subject: { findFirst: jest.fn() } } }));
import prisma from '@/lib/db/prisma';
import { getPublicMeeting, getPublicSubject, meetingTranscriptIsPublic, transcriptIsPublic, publicSubjectSelect, transcriptGateSelect, type PublicMeeting } from '../publicContent';

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
        const meeting = { administrativeBody: { showUnreviewedTranscript: false }, taskStatuses: [] } as unknown as PublicMeeting;
        expect(transcriptIsPublic(meeting)).toBe(false);
        expect(transcriptIsPublic({ ...meeting, taskStatuses: [{ id: 'review' }] })).toBe(true);
        expect(transcriptIsPublic({ ...meeting, administrativeBody: null })).toBe(true);
    });
    it.each([
        [{ administrativeBody: { showUnreviewedTranscript: false }, taskStatuses: [] }, false],
        [{ administrativeBody: { showUnreviewedTranscript: false }, taskStatuses: [{ id: 'review' }] }, true],
        [{ administrativeBody: { showUnreviewedTranscript: true }, taskStatuses: [] }, true],
        [{ administrativeBody: null, taskStatuses: [] }, true],
        [null, false],
    ])('reads the rule for one meeting by its ids: %j is public: %p', async (row, expected) => {
        (prisma.councilMeeting.findUnique as jest.Mock).mockResolvedValueOnce(row);
        await expect(meetingTranscriptIsPublic('city', 'meeting')).resolves.toBe(expected);
        expect(prisma.councilMeeting.findUnique).toHaveBeenLastCalledWith({ where: { cityId_id: { cityId: 'city', id: 'meeting' } }, select: transcriptGateSelect });
    });
});
