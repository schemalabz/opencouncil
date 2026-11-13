/** @jest-environment node */

const mockPersonFindUnique = jest.fn();
const mockPersonFindMany = jest.fn();
const mockTaskFindUnique = jest.fn();
const mockHasVoicePrintConsent = jest.fn();
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
const mockDeleteVoiceData = jest.fn();
jest.mock('@/lib/db/voiceprintsDelete', () => ({ deleteVoiceDataWithoutConsent: (...args: unknown[]) => mockDeleteVoiceData(...args) }));
jest.mock('@/lib/db/voicePrintConsentRule', () => ({
    ...jest.requireActual('@/lib/db/voicePrintConsentRule'),
    hasVoicePrintConsent: (...args: unknown[]) => mockHasVoicePrintConsent(...args),
}));

import { voicePrintConsentInForce } from '@/lib/db/voicePrintConsentRule';
import { findEligiblePeopleForVoiceprintGeneration, getVoiceprintSamples, requestGenerateVoiceprint, requestGenerateVoiceprintsForCity } from '../generateVoiceprint';
import { handleGenerateVoiceprintResult } from '../generateVoiceprintInternal';

beforeEach(() => {
    jest.clearAllMocks();
    mockWithUserAuthorizedToEdit.mockResolvedValue(true);
    mockDeleteVoiceData.mockResolvedValue([]);
});

describe('the voiceprint actions are a superadmin\'s', () => {
    it('authorizes a superadmin before it reads the person or the consent', async () => {
        mockWithUserAuthorizedToEdit.mockRejectedValue(new Error('Forbidden'));

        await expect(requestGenerateVoiceprint('p1', 's1')).rejects.toThrow('Forbidden');
        await expect(findEligiblePeopleForVoiceprintGeneration('chania')).rejects.toThrow('Forbidden');
        await expect(requestGenerateVoiceprintsForCity('chania')).rejects.toThrow('Forbidden');
        await expect(getVoiceprintSamples('p1')).rejects.toThrow('Forbidden');

        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledTimes(4);
        for (const call of mockWithUserAuthorizedToEdit.mock.calls) expect(call).toEqual([{}]);
        expect(mockPersonFindUnique).not.toHaveBeenCalled();
        expect(mockPersonFindMany).not.toHaveBeenCalled();
        expect(mockHasVoicePrintConsent).not.toHaveBeenCalled();
    });
});

describe('requestGenerateVoiceprint', () => {
    it('refuses, as a value, a person whose voiceprint consent is not in force, before any segment search', async () => {
        mockPersonFindUnique.mockResolvedValueOnce({ id: 'p1' });
        mockHasVoicePrintConsent.mockResolvedValue(false);

        await expect(requestGenerateVoiceprint('p1', 's1')).resolves.toEqual({
            ok: false,
            message: expect.stringContaining('no voiceprint consent in force'),
        });

        // The person lookup, and nothing after the refusal.
        expect(mockPersonFindUnique).toHaveBeenCalledTimes(1);
    });

    it('refuses, as a value, a person who does not exist', async () => {
        mockPersonFindUnique.mockResolvedValueOnce(null);

        await expect(requestGenerateVoiceprint('p1', 's1')).resolves.toEqual({ ok: false, message: 'Person not found' });
        expect(mockHasVoicePrintConsent).not.toHaveBeenCalled();
    });

    it('goes on for a person with a consent in force', async () => {
        mockHasVoicePrintConsent.mockResolvedValue(true);
        // The second lookup is the segment search; no tags means the next refusal, which proves the gates passed.
        mockPersonFindUnique
            .mockResolvedValueOnce({ id: 'p1' })
            .mockResolvedValueOnce({ speakerTags: [] });

        await expect(requestGenerateVoiceprint('p1', 's1')).resolves.toEqual({
            ok: false,
            message: expect.stringContaining('cannot become the person\'s voiceprint'),
        });
    });
});

describe('findEligiblePeopleForVoiceprintGeneration', () => {
    it('asks only for people whose consent is in force', async () => {
        mockPersonFindMany.mockResolvedValue([]);

        await findEligiblePeopleForVoiceprintGeneration('chania');

        expect(mockPersonFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ cityId: 'chania', ...voicePrintConsentInForce }),
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
        mockHasVoicePrintConsent.mockResolvedValue(true);

        await handleGenerateVoiceprintResult('task-1', result);

        expect(mockCreateVoicePrintDirect).toHaveBeenCalledWith({
            personId: 'p1',
            sourceSegmentId: 's1',
            startTimestamp: 10,
            endTimestamp: 40,
            sourceAudioUrl: result.audioUrl,
            embedding: 'embedding',
        });
        expect(mockDeleteVoiceData).not.toHaveBeenCalled();
    });

    it('fails the task, stores nothing and removes the clip when the consent closed while the task ran', async () => {
        mockTaskFindUnique.mockResolvedValue(task);
        mockHasVoicePrintConsent.mockResolvedValue(false);

        await expect(handleGenerateVoiceprintResult('task-1', result)).rejects.toThrow('no voiceprint consent in force');

        expect(mockCreateVoicePrintDirect).not.toHaveBeenCalled();
        expect(mockDeleteVoiceData).toHaveBeenCalledWith({ personId: 'p1' }, 'voiceprint of task task-1 refused');
    });

    it('keeps the consent reason when the clip cannot be removed', async () => {
        mockTaskFindUnique.mockResolvedValue(task);
        mockHasVoicePrintConsent.mockResolvedValue(false);
        mockDeleteVoiceData.mockResolvedValue([{ item: 'b/voiceprints/chania/p1/clip.mp3', error: 'AccessDenied' }]);

        await expect(handleGenerateVoiceprintResult('task-1', result)).rejects.toThrow('no voiceprint consent in force');
    });
});

describe('requestGenerateVoiceprintsForCity', () => {
    it('reports an empty list as a value, so the dialog can say why', async () => {
        mockPersonFindMany.mockResolvedValue([]);
        await expect(requestGenerateVoiceprintsForCity('chania', ['p1'])).resolves.toEqual({
            results: [], errors: [], totalRequested: 0, successful: 0, failed: 0,
        });
    });
});
