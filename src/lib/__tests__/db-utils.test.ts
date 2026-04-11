// Mock all dependencies before importing the module under test
jest.mock('../db/prisma', () => ({
    __esModule: true,
    default: {
        person: { findMany: jest.fn() },
        speakerSegment: { findMany: jest.fn() },
        $transaction: jest.fn(),
    }
}));
jest.mock('../db/transcript', () => ({ getTranscript: jest.fn() }));
jest.mock('../db/people', () => ({ getPeopleForMeeting: jest.fn() }));
jest.mock('../db/parties', () => ({ getPartiesForCity: jest.fn() }));
jest.mock('../db/topics', () => ({
    getAllTopics: jest.fn(),
    getActiveTopicsForTasks: jest.fn(),
}));
jest.mock('../db/cities', () => ({ getCity: jest.fn() }));
jest.mock('../db/meetings', () => ({ getCouncilMeeting: jest.fn() }));

import prisma from '../db/prisma';
import { getTranscript } from '../db/transcript';
import { getPeopleForMeeting } from '../db/people';
import { getPartiesForCity } from '../db/parties';
import { getAllTopics, getActiveTopicsForTasks } from '../db/topics';
import { getCity } from '../db/cities';
import { getCouncilMeeting } from '../db/meetings';
import { getRequestOnTranscriptRequestBody } from '../db/utils';
import { makeTranscriptSegment, makePersonWithRoles } from '../../../tests/helpers/builders';

const mockGetTranscript = getTranscript as jest.MockedFunction<typeof getTranscript>;
const mockGetCouncilMeeting = getCouncilMeeting as jest.MockedFunction<typeof getCouncilMeeting>;
const mockGetPeopleForMeeting = getPeopleForMeeting as jest.MockedFunction<typeof getPeopleForMeeting>;
const mockGetPartiesForCity = getPartiesForCity as jest.MockedFunction<typeof getPartiesForCity>;
const mockGetAllTopics = getAllTopics as jest.MockedFunction<typeof getAllTopics>;
const mockGetActiveTopicsForTasks = getActiveTopicsForTasks as jest.MockedFunction<typeof getActiveTopicsForTasks>;
const mockGetCity = getCity as jest.MockedFunction<typeof getCity>;
const mockPrismaPersonFindMany = (prisma.person.findMany as jest.Mock);

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';
const ADMIN_BODY_ID = 'admin-body-1';
const MEETING_DATE = new Date('2024-06-15T10:00:00Z');

function setupCommonMocks() {
    mockGetCouncilMeeting.mockResolvedValue({
        id: MEETING_ID,
        cityId: CITY_ID,
        administrativeBodyId: ADMIN_BODY_ID,
        dateTime: MEETING_DATE,
        administrativeBody: { id: ADMIN_BODY_ID, name: 'City Council' },
    } as any);

    mockGetPartiesForCity.mockResolvedValue([
        { id: 'party-a', name: 'Party A', cityId: CITY_ID },
        { id: 'party-b', name: 'Party B', cityId: CITY_ID },
    ] as any);

    mockGetAllTopics.mockResolvedValue([
        { id: 'topic-1', name: 'Environment' },
    ] as any);

    mockGetActiveTopicsForTasks.mockResolvedValue([
        { id: 'topic-1', name: 'Environment', description: '' },
    ] as any);

    mockGetCity.mockResolvedValue({
        id: CITY_ID,
        name: 'Test City',
    } as any);
}

describe('getRequestOnTranscriptRequestBody', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupCommonMocks();
    });

    it('resolves identified speakers with correct name, party, role, and speakerId', async () => {
        const person = makePersonWithRoles({
            id: 'person-1', name: 'Maria K.',
            partyId: 'party-a', partyName: 'Party A', roleName: 'Council Member',
        });

        mockGetTranscript.mockResolvedValue([
            makeTranscriptSegment({ id: 'seg-1', personId: 'person-1', label: 'Maria (raw)' }),
        ] as any);
        mockPrismaPersonFindMany.mockResolvedValue([person]);
        mockGetPeopleForMeeting.mockResolvedValue([person] as any);

        const result = await getRequestOnTranscriptRequestBody(MEETING_ID, CITY_ID);

        expect(result.transcript[0].speakerName).toBe('Maria K.');
        expect(result.transcript[0].speakerParty).toBe('Party A');
        expect(result.transcript[0].speakerId).toBe('person-1');
        expect(result.topicLabels).toEqual([{ name: 'Environment', description: '' }]);
    });

    it('resolves speakers NOT in the meeting people list but identified in transcript', async () => {
        // Bug fix scenario: speaker assigned in transcript review whose person
        // record is outside the meeting's administrative body filter.
        const outsidePerson = makePersonWithRoles({
            id: 'person-outside', name: 'Nikos P.',
            partyId: 'party-b', partyName: 'Party B',
            roleName: 'Committee Member', adminBodyId: 'other-admin-body',
        });

        mockGetTranscript.mockResolvedValue([
            makeTranscriptSegment({ id: 'seg-1', personId: 'person-outside', label: 'Nikos (typo)' }),
        ] as any);
        // Direct DB query finds the person
        mockPrismaPersonFindMany.mockResolvedValue([outsidePerson]);
        // Meeting filter does NOT include this person
        mockGetPeopleForMeeting.mockResolvedValue([]);

        const result = await getRequestOnTranscriptRequestBody(MEETING_ID, CITY_ID);

        // Should use identified person's real name, NOT the raw label
        expect(result.transcript[0].speakerName).toBe('Nikos P.');
        expect(result.transcript[0].speakerParty).toBe('Party B');
        expect(result.transcript[0].speakerId).toBe('person-outside');
    });

    it('falls back to speakerTag.label for unidentified speakers', async () => {
        mockGetTranscript.mockResolvedValue([
            makeTranscriptSegment({ id: 'seg-1', personId: null, label: 'Unknown Speaker 1' }),
        ] as any);
        mockGetPeopleForMeeting.mockResolvedValue([]);

        const result = await getRequestOnTranscriptRequestBody(MEETING_ID, CITY_ID);

        expect(result.transcript[0].speakerName).toBe('Unknown Speaker 1');
        expect(result.transcript[0].speakerParty).toBeNull();
        expect(result.transcript[0].speakerId).toBeNull();
        expect(result.transcript[0].speakerRole).toBeNull();
    });

    it('uses meetingPeople (filtered) for partiesWithPeople, not identifiedPeople', async () => {
        const councilMember = makePersonWithRoles({
            id: 'person-1', name: 'Anna S.',
            partyId: 'party-a', partyName: 'Party A',
        });
        const outsideSpeaker = makePersonWithRoles({
            id: 'person-outside', name: 'Nikos P.',
            partyId: 'party-b', partyName: 'Party B',
            adminBodyId: 'other-admin-body',
        });

        mockGetTranscript.mockResolvedValue([
            makeTranscriptSegment({ id: 'seg-1', personId: 'person-1' }),
            makeTranscriptSegment({ id: 'seg-2', personId: 'person-outside' }),
        ] as any);
        mockPrismaPersonFindMany.mockResolvedValue([councilMember, outsideSpeaker]);
        // Only councilMember is in the meeting's filtered list
        mockGetPeopleForMeeting.mockResolvedValue([councilMember] as any);

        const result = await getRequestOnTranscriptRequestBody(MEETING_ID, CITY_ID);

        const partyA = result.partiesWithPeople.find(p => p.name === 'Party A');
        const partyB = result.partiesWithPeople.find(p => p.name === 'Party B');

        expect(partyA?.people).toHaveLength(1);
        expect(partyA?.people[0].name).toBe('Anna S.');
        // outsideSpeaker is NOT in meetingPeople, so Party B has no members
        expect(partyB?.people).toHaveLength(0);
    });

    it('skips prisma.person.findMany when no speakers have personId', async () => {
        mockGetTranscript.mockResolvedValue([
            makeTranscriptSegment({ id: 'seg-1', personId: null, label: 'Speaker 1' }),
            makeTranscriptSegment({ id: 'seg-2', personId: null, label: 'Speaker 2' }),
        ] as any);
        mockGetPeopleForMeeting.mockResolvedValue([]);

        await getRequestOnTranscriptRequestBody(MEETING_ID, CITY_ID);

        expect(mockPrismaPersonFindMany).not.toHaveBeenCalled();
    });

    it('deduplicates personIds before querying', async () => {
        const person = makePersonWithRoles({
            id: 'person-1', name: 'Maria K.',
            partyId: 'party-a', partyName: 'Party A',
        });

        mockGetTranscript.mockResolvedValue([
            makeTranscriptSegment({ id: 'seg-1', personId: 'person-1' }),
            makeTranscriptSegment({ id: 'seg-2', personId: 'person-1' }),
            makeTranscriptSegment({ id: 'seg-3', personId: 'person-1' }),
        ] as any);
        mockPrismaPersonFindMany.mockResolvedValue([person]);
        mockGetPeopleForMeeting.mockResolvedValue([person] as any);

        await getRequestOnTranscriptRequestBody(MEETING_ID, CITY_ID);

        expect(mockPrismaPersonFindMany).toHaveBeenCalledWith({
            where: { id: { in: ['person-1'] } },
            include: { roles: { include: { party: true, administrativeBody: true, city: true } } },
        });
    });
});
