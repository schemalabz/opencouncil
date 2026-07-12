import { Realm } from "@prisma/client";
import prisma from "./prisma";
import { auth } from "@/auth";
import { getRealm } from "@/lib/realm.server";
import { createCache } from "@/lib/cache/index";

// The API schema doesn't bound query length, so cap what we store.
const MAX_LOGGED_QUERY_LENGTH = 500;

// "Popular searches" tuning. We surface the most-repeated real queries from the last
// POPULAR_WINDOW_DAYS, keeping the top POPULAR_LIMIT. The bar to appear is deliberately
// high — at least POPULAR_MIN_COUNT searches spread over POPULAR_MIN_DAYS distinct days —
// because the chips are public homepage content fed by unauthenticated endpoints: a
// drive-by burst of identical requests must not be able to seed a suggestion.
const POPULAR_WINDOW_DAYS = 90;
const POPULAR_MIN_COUNT = 10;
const POPULAR_MIN_DAYS = 2;
const POPULAR_LIMIT = 8;
// Skip the messy tail: very short fragments and long pasted addresses make poor chips.
const POPULAR_MIN_LENGTH = 3;
const POPULAR_MAX_LENGTH = 40;
// Popularity shifts slowly; no tag — the TTL alone keeps the chips fresh enough.
const POPULAR_TTL = 900; // 15 min

/**
 * Returns the realm's most frequent real search queries from the recent window, suitable
 * for the landing's "Δημοφιλείς αναζητήσεις" suggestions. Grouped case-insensitively (the
 * most recent original casing wins for display). Returns `[]` when there isn't enough
 * signal — callers blend with a curated list. Never throws.
 */
export async function getPopularSearchQueries(realm: Realm): Promise<string[]> {
    try {
        const since = new Date(Date.now() - POPULAR_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const rows = await prisma.$queryRaw<Array<{ query: string; count: bigint }>>`
            SELECT (ARRAY_AGG("query" ORDER BY "createdAt" DESC))[1] AS query,
                   COUNT(*) AS count
            FROM "SearchQuery"
            WHERE "createdAt" >= ${since}
              AND "realm" = ${realm}::"Realm"
              AND CHAR_LENGTH(TRIM("query")) BETWEEN ${POPULAR_MIN_LENGTH} AND ${POPULAR_MAX_LENGTH}
            GROUP BY LOWER(TRIM("query"))
            HAVING COUNT(*) >= ${POPULAR_MIN_COUNT}
               AND COUNT(DISTINCT DATE("createdAt")) >= ${POPULAR_MIN_DAYS}
            ORDER BY count DESC, query ASC
            LIMIT ${POPULAR_LIMIT}
        `;
        return rows.map((r) => r.query.trim());
    } catch (error) {
        console.error("[Search] Failed to load popular search queries:", error);
        return [];
    }
}

/** Cached variant — the landing fetches this once per visitor, so don't run the GROUP BY each time. */
export async function getPopularSearchQueriesCached(realm: Realm): Promise<string[]> {
    return createCache(
        () => getPopularSearchQueries(realm),
        ["popular-searches", realm],
        { revalidate: POPULAR_TTL },
    )();
}

/**
 * Persists a search query for usage analytics, attributing it to the current
 * user when one is logged in. Never throws — logging must not break search.
 *
 * `source` says which surface logged it ('search' = the /search page pipeline,
 * 'landing' = the landing search box). The realm comes from the request's Host
 * header; outside a request scope (background jobs) it falls back to greece.
 */
export async function logSearchQuery(
    query: string,
    opts?: { source?: "search" | "landing" },
): Promise<void> {
    try {
        const realm = await getRealm().catch(() => Realm.greece);
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
                source: opts?.source ?? "search",
                realm,
                userId: user?.id ?? null,
            },
        });
    } catch (error) {
        console.error("[Search] Failed to log search query:", error);
    }
}
