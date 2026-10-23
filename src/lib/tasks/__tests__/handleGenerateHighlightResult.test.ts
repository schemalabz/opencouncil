/** @jest-environment node */

const mockTaskFindUnique = jest.fn();
const mockHighlightUpdate = jest.fn();
const mockHighlightFindUnique = jest.fn();
const mockSendEmail = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        taskStatus: { findUnique: (...args: unknown[]) => mockTaskFindUnique(...args) },
        highlight: {
            update: (...args: unknown[]) => mockHighlightUpdate(...args),
            findUnique: (...args: unknown[]) => mockHighlightFindUnique(...args),
        },
    },
}));
jest.mock('@/lib/db/highlights', () => ({ canViewHighlight: jest.fn() }));
jest.mock('@/lib/email/highlightComplete', () => ({
    sendHighlightCompleteEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
jest.mock('@/lib/tasks/generateHighlight-core', () => ({ requestGenerateHighlightCore: jest.fn() }));

import { handleGenerateHighlightResult } from '@/lib/tasks/generateHighlight';

const VIDEO = 'https://data.opencouncil.gr/highlights/abc.mp4';

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockTaskFindUnique.mockResolvedValue({ requestBody: JSON.stringify({ parts: [{ id: 'h1' }] }) });
    mockHighlightUpdate.mockResolvedValue({ createdById: 'u1' });
    mockHighlightFindUnique.mockResolvedValue({ createdById: 'u1' });
    mockSendEmail.mockResolvedValue(undefined);
});

describe('handleGenerateHighlightResult', () => {
    it('stores the video on the highlight the task was started for', async () => {
        await handleGenerateHighlightResult('t1', {
            parts: [{ id: 'h1', url: VIDEO, muxPlaybackId: 'mux1', duration: 10, startTimestamp: 0, endTimestamp: 10 }],
        });

        expect(mockHighlightUpdate).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'h1' },
            data: { videoUrl: VIDEO, muxPlaybackId: 'mux1' },
        }));
        expect(mockSendEmail).toHaveBeenCalledWith({ userId: 'u1', highlightId: 'h1', status: 'success' });
    });

    // The callback body is caller data. The request alone says which
    // highlight the task rendered.
    // A rejected result throws, so the task reads as failed rather than as
    // succeeded with no video.
    it('does not write a result that names another highlight', async () => {
        await expect(handleGenerateHighlightResult('t1', {
            parts: [{ id: 'someone-elses', url: VIDEO, duration: 10, startTimestamp: 0, endTimestamp: 10 }],
        })).rejects.toThrow('names highlight someone-elses');

        expect(mockHighlightUpdate).not.toHaveBeenCalled();
        expect(mockSendEmail).toHaveBeenCalledWith({ userId: 'u1', highlightId: 'h1', status: 'failure' });
    });

    it('does not store a video URL that is not a web URL', async () => {
        await expect(handleGenerateHighlightResult('t1', {
            parts: [{ id: 'h1', url: 'javascript:alert(1)', duration: 10, startTimestamp: 0, endTimestamp: 10 }],
        })).rejects.toThrow('not a web URL');

        expect(mockHighlightUpdate).not.toHaveBeenCalled();
        expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ status: 'failure' }));
    });

    it('fails when the result has no parts', async () => {
        await expect(handleGenerateHighlightResult('t1', { parts: [] })).rejects.toThrow('no rendered part');

        expect(mockHighlightUpdate).not.toHaveBeenCalled();
        expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ status: 'failure' }));
    });
});
