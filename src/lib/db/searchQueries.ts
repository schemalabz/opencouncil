import prisma from "./prisma";
import { auth } from "@/auth";

// The API schema doesn't bound query length, so cap what we store.
const MAX_LOGGED_QUERY_LENGTH = 500;

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
