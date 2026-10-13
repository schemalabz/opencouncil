/** @jest-environment node */

const mockMeetingFindUnique = jest.fn();
const mockMeetingUpdate = jest.fn();
const mockVoicePrintFindMany = jest.fn();
const mockGetPeopleWhoMaySpeak = jest.fn();
const mockGetConsentedPersonIds = jest.fn();
const mockStartTask = jest.fn();

jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: {
        councilMeeting: {
            findUnique: (...args: unknown[]) => mockMeetingFindUnique(...args),
            update: (...args: unknown[]) => mockMeetingUpdate(...args),
        },
        voicePrint: { findMany: (...args: unknown[]) => mockVoicePrintFindMany(...args) },
    },
}));
jest.mock('@/lib/db/people', () => ({ getPeopleWhoMaySpeak: (...args: unknown[]) => mockGetPeopleWhoMaySpeak(...args) }));
jest.mock('@/lib/db/personConsent', () => ({ getConsentedPersonIds: (...args: unknown[]) => mockGetConsentedPersonIds(...args) }));
jest.mock('../tasks', () => ({ startTask: (...args: unknown[]) => mockStartTask(...args) }));
jest.mock('../../statistics', () => ({ getStatisticsFor: jest.fn().mockResolvedValue({ people: [] }) }));

import { requestTranscribeInternal } from '../transcribeInternal';

const meeting = {
    id: 'meeting-1',
    cityId: 'city-1',
    administrativeBodyId: 'council',
    dateTime: new Date('2026-09-14T07:30:00Z'),
    city: { language: 'el', persons: [], parties: [] },
    speakerSegments: [],
};
const person = (id: string) => ({ id, name: id, roles: [] });

beforeEach(() => {
    jest.clearAllMocks();
    mockMeetingFindUnique.mockResolvedValue(meeting);
    mockMeetingUpdate.mockResolvedValue(meeting);
    mockStartTask.mockResolvedValue({ id: 'task-1' });
    mockGetPeopleWhoMaySpeak.mockResolvedValue([person('anna'), person('babis'), person('chara')]);
    // Only consented ids are asked of the voiceprint table, so this returns a row for each.
    mockVoicePrintFindMany.mockImplementation(async ({ where }: { where: { personId: { in: string[] } } }) =>
        where.personId.in.map(personId => ({ personId, embedding: `vp-${personId}` })));
});

const sentVoiceprints = () => mockStartTask.mock.calls[0][1].voiceprints;

describe('requestTranscribeInternal and voiceprint consent', () => {
    it('sends only the voiceprints of people whose consent is in force', async () => {
        mockGetConsentedPersonIds.mockResolvedValue(new Set(['anna', 'chara']));

        await requestTranscribeInternal('https://youtu.be/x', 'meeting-1', 'city-1');

        expect(mockGetConsentedPersonIds).toHaveBeenCalledWith(['anna', 'babis', 'chara']);
        expect(mockVoicePrintFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { personId: { in: ['anna', 'chara'] } },
        }));
        expect(sentVoiceprints()).toEqual([
            { personId: 'anna', voiceprint: 'vp-anna' },
            { personId: 'chara', voiceprint: 'vp-chara' },
        ]);
    });

    it('applies the cap of 50 after the consent filter, so nobody without consent takes a slot', async () => {
        const people = Array.from({ length: 60 }, (_, i) => person(`p${i}`));
        const consentedIds = people.slice(0, 55).map(p => p.id);
        mockGetPeopleWhoMaySpeak.mockResolvedValue(people);
        mockGetConsentedPersonIds.mockResolvedValue(new Set(consentedIds));

        await requestTranscribeInternal('https://youtu.be/x', 'meeting-1', 'city-1');

        const sent = sentVoiceprints().map((v: { personId: string }) => v.personId);
        expect(sent).toHaveLength(50);
        expect(sent.every((id: string) => consentedIds.includes(id))).toBe(true);
    });

    it('sends no voiceprints when nobody who may speak has a consent in force', async () => {
        mockGetConsentedPersonIds.mockResolvedValue(new Set());

        await requestTranscribeInternal('https://youtu.be/x', 'meeting-1', 'city-1');

        expect(mockVoicePrintFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { personId: { in: [] } } }));
        expect(sentVoiceprints()).toBeUndefined();
    });
});
