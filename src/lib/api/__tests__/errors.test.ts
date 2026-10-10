/** @jest-environment node */
import * as z from 'zod';
import {
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    errorResponseSchema,
    handleApiError,
    notAuthorizedError,
    searchError,
    searchErrorSchema,
    validationErrorSchema,
    validationIssues,
} from '@/lib/api/errors';

const schema = z.object({ name: z.string().min(2, { error: 'Name is too short' }), age: z.number() });

function zodError(input: unknown): z.ZodError {
    const parsed = schema.safeParse(input);
    if (parsed.success) throw new Error('expected a validation failure');
    return parsed.error;
}

async function body(response: Response): Promise<unknown> {
    return response.json();
}

describe('handleApiError', () => {
    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('answers a ZodError with 400 and a ValidationError of the issues', async () => {
        const response = handleApiError(zodError({ name: 'a' }), 'Failed');

        expect(response.status).toBe(400);
        const json = await body(response);
        expect(validationErrorSchema.safeParse(json).success).toBe(true);
        expect(json).toEqual({
            error: [
                { code: 'too_small', message: 'Name is too short', path: ['name'] },
                { code: 'invalid_type', message: expect.any(String), path: ['age'] },
            ],
        });
    });

    it('keeps only the documented keys of an issue', async () => {
        const response = handleApiError(zodError({ name: 'a', age: 1 }));
        const [issue] = (await body(response) as { error: object[] }).error;
        expect(Object.keys(issue).sort()).toEqual(['code', 'message', 'path']);
    });

    it('keeps a symbol key of a path as text, so the path survives JSON', async () => {
        const error = new z.ZodError([{ code: 'custom', message: 'm', path: [Symbol('k')], input: undefined }]);

        expect(JSON.parse(JSON.stringify(validationIssues(error)))).toEqual([{ code: 'custom', message: 'm', path: ['Symbol(k)'] }]);
        expect(await body(handleApiError(error))).toEqual({ error: [{ code: 'custom', message: 'm', path: ['Symbol(k)'] }] });
    });

    it.each([
        [new BadRequestError('Bad'), 400],
        [new UnauthorizedError(), 401],
        [new ForbiddenError(), 403],
        [new NotFoundError('Missing'), 404],
        [new ConflictError('Taken'), 409],
    ])('answers %p with its status and message', async (error, status) => {
        const response = handleApiError(error, 'Failed');

        expect(response.status).toBe(status);
        const json = await body(response);
        expect(errorResponseSchema.safeParse(json).success).toBe(true);
        expect(json).toEqual({ error: error.message });
    });

    it('answers any other error with 500 and the fallback message, and logs the real error', async () => {
        const internal = new Error('connect ECONNREFUSED 10.0.0.5:5432');
        const response = handleApiError(internal, 'Failed to save');

        expect(response.status).toBe(500);
        expect(await body(response)).toEqual({ error: 'Failed to save' });
        expect(console.error).toHaveBeenCalledWith('API Error:', internal);
    });
});

describe('notAuthorizedError', () => {
    it('is a 401 when nobody is signed in and a 403 for a signed-in user', () => {
        expect(notAuthorizedError(false)).toBeInstanceOf(UnauthorizedError);
        expect(notAuthorizedError(true)).toBeInstanceOf(ForbiddenError);
    });
});

describe('searchError', () => {
    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('keeps the search envelope and carries the shared issues', async () => {
        const response = searchError(zodError({ name: 'a', age: 1 }));

        expect(response.status).toBe(400);
        const json = await body(response);
        expect(searchErrorSchema.safeParse(json).success).toBe(true);
        expect(json).toEqual({
            error: {
                code: 'INVALID_REQUEST',
                message: 'Invalid request parameters',
                details: [{ code: 'too_small', message: 'Name is too short', path: ['name'] }],
            },
        });
    });

    it('does not put the message of an internal error in the body', async () => {
        const response = searchError(new Error('index opencouncil-subjects missing'));

        expect(response.status).toBe(500);
        expect(await body(response)).toEqual({
            error: { code: 'SEARCH_ERROR', message: 'An error occurred while performing the search' },
        });
    });
});
