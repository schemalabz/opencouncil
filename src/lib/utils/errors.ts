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
