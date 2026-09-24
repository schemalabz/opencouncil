import { revalidatePath, revalidateTag } from 'next/cache';
import { after } from 'next/server';

export type Revalidation = {
    /** Served stale one more time while the refresh runs (the 'max' profile). */
    tags?: string[];
    /**
     * Gone at once: the next request blocks on a fresh read. For a cache whose
     * stale value is a 404, such as the list of city ids after a new city.
     */
    blockingTags?: string[];
    paths?: { path: string; type?: 'page' | 'layout' }[];
};

function revalidateNow({ tags = [], blockingTags = [], paths = [] }: Revalidation): void {
    for (const tag of tags) revalidateTag(tag, 'max');
    for (const tag of blockingTags) revalidateTag(tag, { expire: 0 });
    for (const { path, type } of paths) revalidatePath(path, type);
}

/**
 * Revalidate for a write that can run while the response streams.
 *
 * Next executes the revalidations of a route handler when the handler returns
 * its Response. The MCP endpoint returns a streaming Response first and runs
 * the tool call inside the stream, so a plain revalidateTag inside a tool is
 * recorded on the request and never executed. `after()` runs when the stream
 * closes and executes the revalidations that its callback adds, so a write
 * behind a stream reaches the cache through it. A plain route handler loses
 * nothing: Next does not await its flush before the response either.
 *
 * Outside a request (tests, background tasks) `after()` throws, and the
 * direct call is the best that can be done there.
 */
export function revalidateAfterResponse(revalidation: Revalidation): void {
    try {
        after(() => revalidateNow(revalidation));
    } catch {
        revalidateNow(revalidation);
    }
}
