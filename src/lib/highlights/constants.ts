/**
 * Limits shared by the server and the client. Kept apart from src/lib/db so
 * that a client component can read them without pulling Prisma into its bundle.
 */

/** Longest name a highlight may carry. */
export const HIGHLIGHT_NAME_MAX_LENGTH = 200;

/** How many highlights the personal highlights page loads at once. */
export const MY_HIGHLIGHTS_LIMIT = 200;
