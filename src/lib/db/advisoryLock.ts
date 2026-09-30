import type { Prisma } from "@prisma/client";

/**
 * A transaction-scoped Postgres advisory lock on `key`, released at commit
 * or rollback. Two transactions that lock the same key run one after the
 * other, so a check and the write it guards cannot interleave.
 */
export async function lockKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
    // $executeRaw, not $queryRaw: the lock function returns void, which the
    // query client cannot deserialize.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
