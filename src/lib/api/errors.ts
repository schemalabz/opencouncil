import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { LifecycleRuleError } from "@/lib/meetingLifecycleRules";

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

/**
 * Standard error handler for API routes.
 * Converts ApiError instances to appropriate HTTP responses.
 */
export function handleApiError(error: unknown, fallbackMessage: string = "An error occurred"): NextResponse {
    console.error("API Error:", error);
    
    if (error instanceof ApiError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    // A meeting write that breaks a lifecycle rule: the request is well-formed,
    // but the record cannot take it. The code lets a client name the rule.
    if (error instanceof LifecycleRuleError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }

    if (error instanceof ZodError) {
        const message = error.errors.map(e => e.message).join(", ");
        return NextResponse.json({ error: message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : fallbackMessage;
    return NextResponse.json({ error: message }, { status: 500 });
}

