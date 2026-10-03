import 'server-only';

import { prisma } from '@/lib/db/prisma';

/**
 * The OAuth providers linked to a user, by provider id ("google"). The magic
 * link writes no row here, so an empty list is the common case.
 */
export async function getLinkedProviders(userId: string): Promise<string[]> {
    const accounts = await prisma.account.findMany({ where: { userId }, select: { provider: true } });
    return accounts.map((account) => account.provider);
}

/**
 * Removes every link to `provider`. The magic link remains, so this never
 * locks the user out.
 */
export async function unlinkProvider(userId: string, provider: string): Promise<void> {
    await prisma.account.deleteMany({ where: { userId, provider } });
}
