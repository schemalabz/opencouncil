import { Prisma } from '@prisma/client';

export interface RoleRanking {
    roleId: string;
    rank: number | null;
}

export interface ElectedOrderRanking {
    roleId: string;
    electedOrder: number | null;
}

export const roleWithRelationsInclude = {
    include: {
        party: true,
        administrativeBody: true,
        city: true,
    }
} satisfies Prisma.RoleDefaultArgs;

export type RoleWithRelations = Prisma.RoleGetPayload<typeof roleWithRelationsInclude>;

