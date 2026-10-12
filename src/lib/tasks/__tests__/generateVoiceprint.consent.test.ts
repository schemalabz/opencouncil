/** @jest-environment node */

const mockPersonFindUnique = jest.fn();
const mockPersonFindMany = jest.fn();
const mockTaskFindUnique = jest.fn();
const mockGetConsentedPersonIds = jest.fn();
const mockCreateVoicePrintDirect = jest.fn();
const mockWithUserAuthorizedToEdit = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        person: {
            findUnique: (...args: unknown[]) => mockPersonFindUnique(...args),
            findMany: (...args: unknown[]) => mockPersonFindMany(...args),
        },
        taskStatus: { findUnique: (...args: unknown[]) => mockTaskFindUnique(...args) },
    },
}));
jest.mock('@/lib/db/meetings', () => ({ getCouncilMeeting: jest.fn() }));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: (...args: unknown[]) => mockWithUserAuthorizedToEdit(...args) }));
jest.mock('../tasks', () => ({ startTask: jest.fn() }));
jest.mock('@/lib/db/voiceprintsCreate', () => ({ createVoicePrintDirect: (...args: unknown[]) => mockCreateVoicePrintDirect(...args) }));
jest.mock('@/lib/db/personConsent', () => ({
    voicePrintConsentInForce: { voicePrintConsents: { some: { withdrawnAt: null } } },
    getConsentedPersonIds: (...args: unknown[]) => mockGetConsentedPersonIds(...args),
}));

import { findEligiblePeopleForVoiceprintGeneration, requestGenerateVoiceprint } from '../generateVoiceprint';
import { handleGenerateVoiceprintResult } from '../generateVoiceprintInternal';

const consented = (...ids: string[]) => mockGetConsentedPersonIds.mockResolvedValue(new Set(ids));

beforeEach(() => {
    jest.clearAllMocks();
    mockWithUserAuthorizedToEdit.mockResolvedValue(true);
});

describe('requestGenerateVoiceprint', () => {
    it('authorizes on the person\'s city before it reads the consent', async () => {
        mockPersonFindUnique.mockResolvedValueOnce({ cityId: 'chania' });
        mockWithUserAuthorizedToEdit.mockRejectedValue(new Error('Forbidden'));

        await expect(requestGenerateVoiceprint('p1')).rejects.toThrow('Forbidden');

        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'chania' });
        expect(mockGetConsentedPersonIds).not.toHaveBeenCalled();
    });

    it('refuses a person whose voiceprint consent is not in force, before any segment search', async () => {
        mockPersonFindUnique.mockResolvedValueOnce({ cityId: 'chania' });
        consented();

        await expect(requestGenerateVoiceprint('p1')).rejects.toThrow('no voiceprint consent in force');

        // The person lookup for the city, and nothing after the refusal.
        expect(mockPersonFindUnique).toHaveBeenCalledTimes(1);
    });

    it('goes on for a person with a consent in force', async () => {
        consented('p1');
        // The second lookup is the segment search; no tags means the next refusal, which proves the gates passed.
        mockPersonFindUnique
            .mockResolvedValueOnce({ cityId: 'chania' })
            .mockResolvedValueOnce({ speakerTags: [] });

        await expect(requestGenerateVoiceprint('p1')).rejects.toThrow('No speaker segments');
    });
});

describe('findEligiblePeopleForVoiceprintGeneration', () => {
    it('asks only for people whose consent is in force', async () => {
        mockPersonFindMany.mockResolvedValue([]);

        await findEligiblePeopleForVoiceprintGeneration('chania');

        expect(mockPersonFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ cityId: 'chania', voicePrintConsents: { some: { withdrawnAt: null } } }),
        }));
    });
});

describe('handleGenerateVoiceprintResult', () => {
    const task = {
        requestBody: JSON.stringify({ personId: 'p1', segmentId: 's1', startTimestamp: 10, endTimestamp: 40 }),
    };
    const result = { audioUrl: 'https://opencouncil.fra1.cdn.digitaloceanspaces.com/voiceprints/chania/p1/clip.mp3', voiceprint: 'embedding', duration: 30 };

    it('stores the embedding while the consent is in force', async () => {
        mockTaskFindUnique.mockResolvedValue(task);
        consented('p1');

        await handleGenerateVoiceprintResult('task-1', result);

        expect(mockCreateVoicePrintDirect).toHaveBeenCalledWith({
            personId: 'p1',
            sourceSegmentId: 's1',
            startTimestamp: 10,
            endTimestamp: 40,
            sourceAudioUrl: result.audioUrl,
            embedding: 'embedding',
        });
    });

    it('fails the task and stores nothing when the consent closed while the task ran', async () => {
        mockTaskFindUnique.mockResolvedValue(task);
        consented();

        await expect(handleGenerateVoiceprintResult('task-1', result)).rejects.toThrow('no voiceprint consent in force');

        expect(mockCreateVoicePrintDirect).not.toHaveBeenCalled();
    });
});
