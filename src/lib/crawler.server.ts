// Server-only by convention: uses next/headers, so it can only run in a request
// scope (server components / route handlers). Keep it out of client bundles
// and out of unstable_cache callbacks.
import { headers } from 'next/headers';
import { isbot } from 'isbot';

/**
 * Whether the current request comes from a crawler, by its User-Agent.
 *
 * `isbot` keeps a maintained list of crawlers. Next's own `userAgent().isBot`
 * knows the search engines and GPTBot but not ClaudeBot, Bytespider,
 * Amazonbot, meta-externalagent, CCBot, PerplexityBot, OAI-SearchBot or the
 * SEO crawlers, and those may be most of the subject-page traffic. A crawler
 * gets a page without the parts that only a reader uses, such as the related
 * subjects, which cost index queries on every page it walks.
 */
export async function isCrawlerRequest(): Promise<boolean> {
    return isbot((await headers()).get('user-agent'));
}
