/**
 * The limits of a phone verification (issue #813), shared by the server that
 * applies them and the form that explains them. No imports: the form is a
 * Client Component.
 */

export const CODE_LENGTH = 6;
/** How long a code is good for. */
export const CODE_TTL_MS = 10 * 60_000;
/** Wrong codes a reader may type before the code is void. */
export const MAX_ATTEMPTS = 5;
/** The wait between two codes to the same reader. */
export const RESEND_COOLDOWN_MS = 30_000;
/** The window the per-reader and per-number send caps count in. */
export const SEND_WINDOW_MS = 60 * 60_000;
/** Codes one reader may request per window. */
export const MAX_SENDS_PER_USER_PER_WINDOW = 3;
/** Codes one number may receive per window, across accounts. */
export const MAX_SENDS_PER_PHONE_PER_WINDOW = 5;
/** The code to one number within the window that first alerts the operators. */
export const ABUSE_WARNING_SENDS = 3;
