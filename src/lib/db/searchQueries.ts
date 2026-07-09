import prisma from "./prisma";
import { auth } from "@/auth";

// The API schema doesn't bound query length, so cap what we store.
const MAX_LOGGED_QUERY_LENGTH = 500;

// "Popular searches" tuning. We surface the most-repeated real queries from the last
// POPULAR_WINDOW_DAYS, but only ones searched at least POPULAR_MIN_COUNT times (so a
// single curious visitor can't seed a suggestion), keeping the top POPULAR_LIMIT.
const POPULAR_WINDOW_DAYS = 90;
const POPULAR_MIN_COUNT = 3;
const POPULAR_LIMIT = 8;
// Skip the messy tail: very short fragments and long pasted addresses make poor chips.
const POPULAR_MIN_LENGTH = 3;
const POPULAR_MAX_LENGTH = 40;

/**
 * Returns the most frequent real search queries from the recent window, suitable for the
 * landing's "Δημοφιλείς αναζητήσεις" suggestions. Grouped case-insensitively (the most
 * recent original casing wins for display). Returns `[]` when there isn't enough signal —
 * callers fall back to a curated list. Never throws.
 */
export async function getPopularSearchQueries(): Promise<string[]> {
    try {
        const since = new Date(Date.now() - POPULAR_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const rows = await prisma.$queryRaw<Array<{ query: string; count: bigint }>>`
            SELECT (ARRAY_AGG("query" ORDER BY "createdAt" DESC))[1] AS query,
                   COUNT(*) AS count
            FROM "SearchQuery"
            WHERE "createdAt" >= ${since}
              AND CHAR_LENGTH(TRIM("query")) BETWEEN ${POPULAR_MIN_LENGTH} AND ${POPULAR_MAX_LENGTH}
            GROUP BY LOWER(TRIM("query"))
            HAVING COUNT(*) >= ${POPULAR_MIN_COUNT}
            ORDER BY count DESC, query ASC
            LIMIT ${POPULAR_LIMIT}
        `;
        return rows.map((r) => r.query.trim());
    } catch (error) {
        console.error("[Search] Failed to load popular search queries:", error);
        return [];
    }
}

/**
 * Persists a search query for usage analytics, attributing it to the current
 * user when one is logged in. Never throws — logging must not break search.
 */
export async function logSearchQuery(query: string): Promise<void> {
    try {
        const session = await auth();
        // Resolve only the user id: getCurrentUser() would join the full
        // administers relations, which is wasteful on the search hot path.
        const user = session?.user?.email
            ? await prisma.user.findUnique({
                  where: { email: session.user.email },
                  select: { id: true },
              })
            : null;
        await prisma.searchQuery.create({
            data: {
                query: query.slice(0, MAX_LOGGED_QUERY_LENGTH),
                userId: user?.id ?? null,
            },
        });
    } catch (error) {
        console.error("[Search] Failed to log search query:", error);
    }
}
