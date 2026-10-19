import { Prisma } from '@prisma/client';
import { publicAdministrativeBodyRelation } from './administrativeBody';

export interface ElectedOrderRanking {
    roleId: string;
    electedOrder: number | null;
}

export const roleWithRelationsInclude = {
    include: {
        party: true,
        administrativeBody: publicAdministrativeBodyRelation,
        city: true,
    }
} satisfies Prisma.RoleDefaultArgs;

export type RoleWithRelations = Prisma.RoleGetPayload<typeof roleWithRelationsInclude>;

