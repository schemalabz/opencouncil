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
 * `formatMessage` turns the message of each issue into the text to show. A
 * form passes `useValidationMessage()`, so that a message of the catalog shows
 * in the language of the reader, as it does under a field.
 */
export function apiErrorMessage(body: unknown, fallback: string, formatMessage?: (message: string) => string): string {
    const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
    if (typeof error === 'string' && error) return error;
    if (Array.isArray(error) && error.length > 0) {
        const issues: FormattableIssue[] = formatMessage
            ? error.map((issue: FormattableIssue) => ({ ...issue, message: formatMessage(issue.message) }))
            : error;
        return formatValidationIssues(issues).join('\n');
    }
    return fallback;
}
