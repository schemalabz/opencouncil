import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";

const UNIQUE_CONFLICT = "P2002";
const SERIALIZATION_FAILURE = "P2034";

/**
 * Run `work` in a serializable transaction, so a check and the write that
 * depends on it cannot interleave with a concurrent run: the loser fails
 * with P2034, and one retry then sees the winner's rows. A partial unique
 * index is the backstop of each caller; a P2002 from it, on either attempt,
 * is the same answer, and `onUniqueConflict` says what that answer is. It
 * runs outside the failed transaction, so it can read what the winner wrote.
 */
export async function serializableOnce<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    onUniqueConflict: () => T | Promise<T>,
): Promise<T> {
    const attempt = () => prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const codeOf = (error: unknown) => (error as { code?: string }).code;
    try {
        return await attempt();
    } catch (error) {
        if (codeOf(error) === UNIQUE_CONFLICT) return onUniqueConflict();
        if (codeOf(error) !== SERIALIZATION_FAILURE) throw error;
    }
    try {
        return await attempt();
    } catch (error) {
        if (codeOf(error) === UNIQUE_CONFLICT) return onUniqueConflict();
        throw error;
    }
}
