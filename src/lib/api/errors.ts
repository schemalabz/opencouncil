import { NextResponse } from "next/server";
import * as z from "zod";
import { LifecycleRuleError } from "@/lib/meetingLifecycleRules";

/**
 * The error bodies of the API. The handlers build them with the functions
 * below, and the OpenAPI spec documents them with these same schemas, so the
 * spec and the runtime have one definition.
 *
 * - A request that fails a zod schema answers 400 with `ValidationError`.
 * - Every other error answers with `ErrorResponse`.
 */
const validationIssueSchema = z.object({
    code: z.string(),
    message: z.string(),
    path: z.array(z.union([z.string(), z.number()])),
}).meta({ id: 'ValidationIssue' });

export const validationErrorSchema = z.object({
    error: z.array(validationIssueSchema),
}).meta({
    id: 'ValidationError',
    description: 'The request failed validation. Each issue names the field (`path`) and the problem.',
});

export const errorResponseSchema = z.object({
    error: z.string(),
}).meta({ id: 'ErrorResponse' });

/**
 * A meeting write that breaks a lifecycle rule (422): the request is
 * well-formed, but the record cannot take it. `code` names the rule.
 */
export const lifecycleRuleErrorSchema = errorResponseSchema.extend({
    code: z.string().meta({ description: 'The lifecycle rule that the write breaks, e.g. postponedFromTaken.' }),
}).meta({ id: 'LifecycleRuleError' });

/**
 * The error body of POST /api/search. The public search API published this
 * envelope before the other routes had a contract, so it keeps it. Its
 * validation branch carries the same issues as `ValidationError`.
 */
export const searchErrorSchema = z.object({
    error: z.discriminatedUnion('code', [
        z.object({
            code: z.literal('INVALID_REQUEST'),
            message: z.string(),
            details: z.array(validationIssueSchema),
        }),
        z.object({
            code: z.literal('SEARCH_ERROR'),
            message: z.string(),
        }),
    ]),
}).meta({ id: 'SearchError' });

export type ValidationIssue = z.input<typeof validationIssueSchema>;
type ValidationErrorBody = z.input<typeof validationErrorSchema>;
type ErrorResponseBody = z.input<typeof errorResponseSchema>;
type LifecycleRuleErrorBody = z.input<typeof lifecycleRuleErrorSchema>;
type SearchErrorBody = z.input<typeof searchErrorSchema>;

/**
 * Base class for API errors with explicit status codes.
 */
export class ApiError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string
    ) {
        super(message);
        this.name = this.constructor.name;
    }
}

/**
 * 400 Bad Request - Invalid input or validation error
 */
export class BadRequestError extends ApiError {
    constructor(message: string = "Invalid request") {
        super(400, message);
    }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class UnauthorizedError extends ApiError {
    constructor(message: string = "Authentication required") {
        super(401, message);
    }
}

/**
 * 403 Forbidden - Authenticated but not authorized
 */
export class ForbiddenError extends ApiError {
    constructor(message: string = "Not authorized") {
        super(403, message);
    }
}

/**
 * 404 Not Found - Resource does not exist
 */
export class NotFoundError extends ApiError {
    constructor(message: string = "Not found") {
        super(404, message);
    }
}

/**
 * 409 Conflict - Request conflicts with current state
 */
export class ConflictError extends ApiError {
    constructor(message: string = "Conflict") {
        super(409, message);
    }
}

/** The refusal of a guard: 401 when nobody is signed in, 403 when the user lacks the right. */
export function notAuthorizedError(signedIn: boolean): ApiError {
    return signedIn ? new ForbiddenError() : new UnauthorizedError();
}

/**
 * The issues of a zod error, as the API returns them. The projection keeps the
 * documented keys only, and a symbol key in a path does not survive JSON.
 */
export function validationIssues(error: z.ZodError): ValidationIssue[] {
    return error.issues.map(({ code, message, path }) => ({
        code,
        message,
        path: path.map(key => typeof key === "symbol" ? String(key) : key),
    }));
}

/** A 400 `ValidationError` response for a request that failed a zod schema. */
function validationError(error: z.ZodError): NextResponse<ValidationErrorBody> {
    return NextResponse.json<ValidationErrorBody>({ error: validationIssues(error) }, { status: 400 });
}

/** An `ErrorResponse` with the given status. */
export function errorResponse(status: number, message: string): NextResponse<ErrorResponseBody> {
    return NextResponse.json<ErrorResponseBody>({ error: message }, { status });
}

/** The response of POST /api/search for an error that it caught. */
export function searchError(error: unknown): NextResponse<SearchErrorBody> {
    if (error instanceof z.ZodError) {
        return NextResponse.json<SearchErrorBody>({
            error: { code: 'INVALID_REQUEST', message: 'Invalid request parameters', details: validationIssues(error) },
        }, { status: 400 });
    }
    console.error('Search error:', error);
    return NextResponse.json<SearchErrorBody>({
        error: { code: 'SEARCH_ERROR', message: 'An error occurred while performing the search' },
    }, { status: 500 });
}

/**
 * The response for an error that a route handler caught.
 * - ZodError: 400 `ValidationError`.
 * - ApiError (the auth guards throw these too): its status and message.
 * - LifecycleRuleError: 422 `LifecycleRuleError`, with the code of the rule.
 * - Anything else: 500 with `fallbackMessage`. The real error goes to the log
 *   only, because its message can name internals.
 */
export function handleApiError(
    error: unknown,
    fallbackMessage: string = "An error occurred"
): NextResponse<ValidationErrorBody | ErrorResponseBody | LifecycleRuleErrorBody> {
    if (error instanceof z.ZodError) {
        return validationError(error);
    }

    if (error instanceof ApiError) {
        return errorResponse(error.statusCode, error.message);
    }

    if (error instanceof LifecycleRuleError) {
        return NextResponse.json<LifecycleRuleErrorBody>({ error: error.message, code: error.code }, { status: 422 });
    }

    console.error("API Error:", error);
    return errorResponse(500, fallbackMessage);
}
