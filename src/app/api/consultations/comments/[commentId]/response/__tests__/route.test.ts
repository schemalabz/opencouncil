/** @jest-environment node */
import type { NextRequest } from 'next/server';

jest.mock('@/lib/db/consultationResponses', () => ({
    respondToConsultationComment: jest.fn(),
    deleteConsultationCommentResponse: jest.fn(),
}));

import { DELETE, PUT } from '../route';
import { deleteConsultationCommentResponse, respondToConsultationComment } from '@/lib/db/consultationResponses';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';

const mockRespond = respondToConsultationComment as jest.Mock;
const mockDelete = deleteConsultationCommentResponse as jest.Mock;

const params = { params: Promise.resolve({ commentId: 'c1' }) };

function put(body: unknown) {
    const request = new Request('http://localhost/api/consultations/comments/c1/response', {
        method: 'PUT',
        body: typeof body === 'string' ? body : JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    }) as unknown as NextRequest;
    return PUT(request, params);
}

beforeEach(() => jest.clearAllMocks());

describe('PUT /api/consultations/comments/[commentId]/response', () => {
    it('passes the text to the data module and returns its result', async () => {
        const result = { response: { body: '<p>Θα το δούμε.</p>', createdAt: '2026-10-13T09:00:00.000Z', updatedAt: '2026-10-13T09:00:00.000Z' }, created: true, emailSent: true };
        mockRespond.mockResolvedValue(result);

        const response = await put({ text: 'Θα το δούμε.' });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(result);
        expect(mockRespond).toHaveBeenCalledWith('c1', 'Θα το δούμε.');
    });

    it('passes an empty text when the body has none, so the data module answers 400', async () => {
        mockRespond.mockRejectedValue(new BadRequestError('Response body cannot be empty'));

        expect((await put({ text: 42 })).status).toBe(400);
        expect((await put('not json')).status).toBe(400);
        expect(mockRespond).toHaveBeenCalledWith('c1', '');
    });

    it.each([
        [new UnauthorizedError(), 401],
        [new ForbiddenError(), 403],
        [new NotFoundError('Comment not found'), 404],
    ])('maps %p to %i', async (error, status) => {
        mockRespond.mockRejectedValue(error);
        const response = await put({ text: 'x' });
        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error: error.message });
    });
});

describe('DELETE /api/consultations/comments/[commentId]/response', () => {
    it('removes the response', async () => {
        mockDelete.mockResolvedValue(undefined);
        const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }) as unknown as NextRequest, params);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(mockDelete).toHaveBeenCalledWith('c1');
    });

    it('refuses a reader who does not administer the city', async () => {
        mockDelete.mockRejectedValue(new ForbiddenError());
        const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }) as unknown as NextRequest, params);
        expect(response.status).toBe(403);
    });
});
