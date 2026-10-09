import { requestTranscribe } from '../transcribe';
import { requestTranscribeInternal } from '../transcribeInternal';
import { ConflictError } from '@/lib/api/errors';
import { PipelineBusyError, TaskAlreadyExistsError } from '../types';

jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('../../db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('../transcribeInternal', () => ({ requestTranscribeInternal: jest.fn(), deleteExistingSpeakerData: jest.fn() }));
jest.mock('../fixTranscriptInternal', () => ({ requestFixTranscriptInternal: jest.fn() }));
jest.mock('../autoTrigger', () => ({ autoTriggerTask: jest.fn() }));

const internal = requestTranscribeInternal as jest.Mock;

describe('requestTranscribe', () => {
    it.each([
        new ConflictError('Meeting is held as byCirculation: it has no recording to transcribe'),
        new PipelineBusyError('transcribe', 'processAgenda'),
        new TaskAlreadyExistsError('transcribe', 'already_running'),
    ])('returns the refusal %p as a value, so production shows its message', async (error) => {
        internal.mockRejectedValueOnce(error);
        await expect(requestTranscribe('https://youtu.be/x', 'm', 'c')).resolves.toEqual({ ok: false, message: error.message });
    });

    it('throws an unexpected error', async () => {
        internal.mockRejectedValueOnce(new Error('boom'));
        await expect(requestTranscribe('https://youtu.be/x', 'm', 'c')).rejects.toThrow('boom');
    });
});
