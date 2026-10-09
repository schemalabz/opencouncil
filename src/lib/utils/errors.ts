/**
 * Text for a caught value. A `catch` receives whatever was thrown, which need not
 * be an `Error` — `undefined.message` itself throws, so a handler that reads it
 * fails inside its own `catch`.
 */
export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Like `errorMessage`, but keeps the stack when there is one, for storage. */
export function errorDetail(error: unknown): string {
    return error instanceof Error ? (error.stack ?? error.message).trim() : String(error);
}

type ErrorLike = { message: string; name?: unknown; code?: unknown; cause?: unknown; errors?: unknown };

// Duck-typed, not `instanceof Error`: an error from another realm (a Jest
// sandbox, a worker) fails `instanceof` but is still an error.
function isErrorLike(value: unknown): value is ErrorLike {
    return typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string';
}

/** One line for one thrown value. An empty message falls back to the error code, then to the error name. */
function headline(value: unknown): string {
    if (!isErrorLike(value)) return String(value);
    if (value.message) return value.message;
    const name = typeof value.name === 'string' && value.name ? value.name : 'Error';
    return typeof value.code === 'string' ? `${name}: ${value.code}` : name;
}

/** The name of `value`, trimmed, or `undefined` when it has none worth printing. */
function errorName(value: unknown): string | undefined {
    if (!isErrorLike(value) || typeof value.name !== 'string') return undefined;
    const name = value.name.trim();
    return name || undefined;
}

/**
 * The text that the CLI prints for a failure. node-postgres rejects a refused
 * connection with an AggregateError whose message is empty, so the message
 * alone prints an empty line. This text adds the message of each inner error
 * and each error of the `cause` chain. A cause whose message the text already
 * holds adds nothing. A headline that trims to nothing (an empty or
 * whitespace-only message, or `undefined` thrown directly) is skipped, so the
 * text never carries a blank line; when every headline in the chain is empty,
 * it falls back to the error's own name, or `unknown error`.
 */
export function formatError(error: unknown): string {
    const lines: string[] = [];
    const seen = new Set<unknown>();
    let current: unknown = error;
    while (current !== undefined && current !== null && !seen.has(current)) {
        seen.add(current);
        const head = headline(current).trim();
        if (head) {
            if (lines.length === 0) lines.push(head);
            else if (!lines.join('\n').includes(head)) lines.push(`caused by: ${head}`);
        }
        if (isErrorLike(current) && Array.isArray(current.errors)) {
            for (const inner of current.errors) {
                const innerHead = headline(inner).trim();
                if (innerHead) lines.push(`  ${innerHead}`);
            }
        }
        current = isErrorLike(current) ? current.cause : undefined;
    }
    if (lines.length) return lines.join('\n');
    return errorName(error) ?? 'unknown error';
}
