// One line per issue of a zod validation error, as `path: message`. A zod
// issue and an issue of a 400 `ValidationError` body both fit this type.
export type FormattableIssue = {
    path?: PropertyKey[];
    message: string;
};

export function formatValidationIssues(issues: FormattableIssue[]): string[] {
    return issues.map(issue => `${issue.path?.map(String).join('.') || 'root'}: ${issue.message}`);
}

/**
 * The message to show for the JSON body of a failed API response: the text of
 * an `ErrorResponse`, or one line per issue of a `ValidationError`.
 */
export function apiErrorMessage(body: unknown, fallback: string): string {
    const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
    if (typeof error === 'string' && error) return error;
    if (Array.isArray(error) && error.length > 0) return formatValidationIssues(error).join('\n');
    return fallback;
}
