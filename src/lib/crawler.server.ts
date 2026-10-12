// Server-only by convention: uses next/headers, so it can only run in a request
// scope (server components / route handlers). Keep it out of client bundles
// and out of unstable_cache callbacks.
import { headers } from 'next/headers';
import { userAgent } from 'next/server';

/**
 * Whether the current request comes from a crawler, by its User-Agent.
 *
 * Next's `userAgent` recognises the search engines and the AI crawlers. A
 * crawler gets a page without the parts that only a reader uses, such as the
 * related subjects, which cost index queries on every page it walks.
 */
export async function isCrawlerRequest(): Promise<boolean> {
    return userAgent({ headers: await headers() }).isBot;
}
