import { Prisma } from '@prisma/client';

/**
 * The accounts of people: every read that means people uses it. A machine
 * account (#590) is a User row too, but it is read only through
 * src/lib/db/machineAccounts.ts, so the two never mix.
 */
export const peopleOnly = { isMachine: false } satisfies Prisma.UserWhereInput;
