/**
 * Picks a locale's entry out of an email copy table.
 *
 * Email copy lives in typed per-locale tables next to each template rather than
 * in `messages/`, because emails are rendered outside any next-intl request
 * scope — from Auth.js provider callbacks and from task callbacks, neither of
 * which can load the catalogs. This is the single place that decides what
 * happens when a locale has no entry, so no table can drift into its own
 * fallback rule, and it keeps the unchecked index cast out of the templates.
 *
 * Dependency-free on purpose: `BaseTemplate` and the auth email reach the
 * middleware bundle through `auth.config.ts`.
 */
export function emailCopy<L extends string, T>(table: Record<L, T>, locale: string, fallback: L): T {
    return (table as Record<string, T | undefined>)[locale] ?? table[fallback];
}
