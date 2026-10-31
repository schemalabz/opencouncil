/** @jest-environment node */

const mockEditFindUnique = jest.fn();
const mockUpdateMany = jest.fn();
const mockEditCreate = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('@/lib/db/prisma', () => {
    const tx = {
        utterance: { updateMany: (...args: unknown[]) => mockUpdateMany(...args) },
        utteranceEdit: { create: (...args: unknown[]) => mockEditCreate(...args) },
    };
    return {
        __esModule: true,
        default: {
            utteranceEdit: { findUnique: (...args: unknown[]) => mockEditFindUnique(...args) },
            $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
        },
    };
});

import { revertTranscriptEdit } from '../utteranceEdits';
import { ConflictError, NotFoundError } from '@/lib/api/errors';

const EDIT = {
    id: 'e1', utteranceId: 'u1', beforeText: 'Ο κ. Νέκας.', afterText: 'Ο κ. Λέκκας.', editedBy: 'task', userId: null,
    taskId: 't1', createdAt: new Date('2026-10-16T10:00:00Z'), task: { type: 'fixFromMinutes', responseBody: null },
    utterance: { startTimestamp: 12, text: 'Ο κ. Λέκκας.', speakerSegment: { cityId: 'athens', meetingId: 'm1' } },
};

beforeEach(() => {
    jest.clearAllMocks();
    mockEditFindUnique.mockResolvedValue(EDIT);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockEditCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        ...EDIT, id: 'e2', ...data, taskId: null, task: null,
    }));
});

describe('revertTranscriptEdit', () => {
    it('writes the earlier text only while the utterance holds the text it read, and records that text', async () => {
        const revert = await revertTranscriptEdit('athens', 'm1', 'e1', 'user-1');

        expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { id: 'u1', text: 'Ο κ. Λέκκας.' },
            data: { text: 'Ο κ. Νέκας.', lastModifiedBy: 'user' },
        });
        expect(mockEditCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: { utteranceId: 'u1', beforeText: 'Ο κ. Λέκκας.', afterText: 'Ο κ. Νέκας.', editedBy: 'user', userId: 'user-1' },
        }));
        expect(revert.currentText).toBe('Ο κ. Νέκας.');
    });

    it('refuses when another edit changed the utterance in between, and records nothing', async () => {
        mockUpdateMany.mockResolvedValue({ count: 0 });

        await expect(revertTranscriptEdit('athens', 'm1', 'e1', 'user-1')).rejects.toThrow(ConflictError);
        expect(mockEditCreate).not.toHaveBeenCalled();
    });

    it('refuses an edit of another meeting', async () => {
        await expect(revertTranscriptEdit('athens', 'other', 'e1', 'user-1')).rejects.toThrow(NotFoundError);
        expect(mockUpdateMany).not.toHaveBeenCalled();
    });
});
