import { Prisma } from '@prisma/client';
import { mcpTokenListOrder, mcpTokenListSelect } from './mcpToken';

/**
 * The accounts of people: every read that means people uses it. A machine
 * account (#590) is a User row too, but it is read only through
 * src/lib/db/machineAccounts.ts, so the two never mix.
 */
export const peopleOnly = { isMachine: false } satisfies Prisma.UserWhereInput;

/** Machine accounts only: the reads of src/lib/db/machineAccounts.ts. */
export const machineAccountsOnly = { isMachine: true } satisfies Prisma.UserWhereInput;

/** A user with what it administers, as the admin users tools show it. */
export const userWithAdministersInclude = {
    administers: {
        include: {
            city: true,
            party: {
                include: {
                    city: true
                }
            },
            person: {
                include: {
                    city: true
                }
            },
            administrativeBody: {
                include: {
                    city: true
                }
            }
        }
    }
} satisfies Prisma.UserInclude;

export type UserWithAdministers = Prisma.UserGetPayload<{ include: typeof userWithAdministersInclude }>;

/** A machine account with its rights and its MCP tokens, as its admin page shows it. */
export const machineAccountWithTokensInclude = {
    ...userWithAdministersInclude,
    mcpTokens: { select: mcpTokenListSelect, orderBy: mcpTokenListOrder },
} satisfies Prisma.UserInclude;

export type MachineAccountWithTokens = Prisma.UserGetPayload<{ include: typeof machineAccountWithTokensInclude }>;
