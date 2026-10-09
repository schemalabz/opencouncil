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
 * The message to show for the JSON body of a failed API response.
 * `formatMessage` turns each message that the route wrote into the text to
 * show. A form passes `useValidationMessage()`, so that a message of the
 * catalog (`vmsg`) shows in the language of the reader, as it does under a
 * field.
 * - A `ValidationError`: one line per issue.
 * - The text of an `ErrorResponse` with a 4xx status other than 401 and 403.
 *   The route wrote it for the request, for example a 409 conflict or a 422
 *   lifecycle rule.
 * - `fallback` for everything else. The text of a 401, a 403 or a 5xx is a
 *   generic English string, and the caller has a message for the reader.
 */
export function apiErrorMessage(body: unknown, status: number, fallback: string, formatMessage?: (message: string) => string): string {
    const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
    const format = formatMessage ?? ((message: string) => message);
    if (Array.isArray(error) && error.length > 0) {
        return formatValidationIssues(error.map((issue: FormattableIssue) => ({ ...issue, message: format(issue.message) }))).join('\n');
    }
    const requestError = status >= 400 && status < 500 && status !== 401 && status !== 403;
    if (requestError && typeof error === 'string' && error) return format(error);
    return fallback;
}
