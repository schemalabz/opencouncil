"use server";
import prisma from "./prisma";

export interface RoleRanking {
    roleId: string;
    rank: number | null;
}

/**
 * Updates role rankings for roles belonging to a specific party and city.
 * Validates that all roles belong to the specified party and city before updating.
 * 
 * @param cityId - The city ID that all roles must belong to
 * @param partyId - The party ID that all roles must belong to
 * @param rankings - Array of role rankings to update
 * @throws Error if validation fails or update fails
 */
export async function updateRoleRankings(
    cityId: string,
    partyId: string,
    rankings: RoleRanking[]
): Promise<void> {
    const roleIds = rankings.map(r => r.roleId);

    // First verify the party exists and belongs to the specified city
    const party = await prisma.party.findUnique({
        where: { id: partyId },
        select: { cityId: true }
    });

    if (!party) {
        throw new Error('Party not found');
    }

    if (party.cityId !== cityId) {
        throw new Error('Party does not belong to the specified city');
    }

    // Verify all roles belong to the specified party and city
    const roles = await prisma.role.findMany({
        where: {
            id: { in: roleIds }
        },
        select: {
            id: true,
            partyId: true,
            cityId: true
        }
    });

    // Check that all requested roles exist
    if (roles.length !== roleIds.length) {
        throw new Error('One or more roles not found');
    }

    // Verify all roles belong to the specified party
    const invalidRoles = roles.filter(role => role.partyId !== partyId);
    if (invalidRoles.length > 0) {
        throw new Error('One or more roles do not belong to the specified party');
    }

    // Update roles in a transaction
    // Ownership has already been validated above, so it's safe to update by id
    await prisma.$transaction(
        rankings.map(({ roleId, rank }) =>
            prisma.role.update({
                where: { id: roleId },
                data: { rank }
            })
        )
    );
}

