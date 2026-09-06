"use server";
import prisma from "./prisma";
import { ElectedOrderRanking } from "@/lib/db/types";
import { withUserAuthorizedToEdit } from "@/lib/auth";

/**
 * Updates elected order for roles belonging to a specific administrative body within a city.
 * Validates that all roles belong to the specified administrative body and city before updating.
 *
 * @param cityId - The city ID that all roles must belong to
 * @param administrativeBodyId - The administrative body ID that all roles must belong to
 * @param rankings - Array of elected order rankings to update
 * @throws Error if validation fails or update fails
 */
export async function updateElectedOrder(
    cityId: string,
    administrativeBodyId: string,
    rankings: ElectedOrderRanking[]
): Promise<void> {
    await withUserAuthorizedToEdit({ cityId });
    const roleIds = rankings.map(r => r.roleId);

    // Verify all roles exist and belong to the specified administrative body
    const roles = await prisma.role.findMany({
        where: {
            id: { in: roleIds }
        },
        select: {
            id: true,
            administrativeBodyId: true,
            person: { select: { cityId: true } }
        }
    });

    if (roles.length !== roleIds.length) {
        throw new Error('One or more roles not found');
    }

    const invalidRoles = roles.filter(
        role => role.administrativeBodyId !== administrativeBodyId
            || role.person.cityId !== cityId
    );
    if (invalidRoles.length > 0) {
        throw new Error('One or more roles do not belong to the specified administrative body');
    }

    // Update roles in a transaction
    await prisma.$transaction(
        rankings.map(({ roleId, electedOrder }) =>
            prisma.role.update({
                where: { id: roleId },
                data: { electedOrder }
            })
        )
    );
}
