"use server";

import { Prisma, User } from "@prisma/client";
import prisma from "./prisma";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api/errors";
import { withUserAuthorizedToEdit, getCurrentUser } from "../auth";
import { devToolsAllowed } from "@/lib/deployment";
import { claimedLink } from "@/lib/db/personClaim";
import { isMachineAccountAddress } from "@/lib/auth/machineAccounts";
import { findMachineAccount } from "@/lib/db/machineAccounts";
import { peopleOnly, userWithAdministersInclude, type UserWithAdministers } from "@/lib/db/types";

const userWithRelationsInclude = {
    ...userWithAdministersInclude,
    notificationPreferences: {
        include: {
            city: true,
            interests: true,
            locations: true
        }
    },
    petitions: {
        include: {
            city: true
        }
    }
} satisfies Prisma.UserInclude;


export type UserWithRelations = Prisma.UserGetPayload<{ include: typeof userWithRelationsInclude }>;

export type AdminUserData = Partial<Pick<User, 'email' | 'name' | 'isSuperAdmin' | 'onboarded'>> & {
    administers?: Prisma.AdministersUncheckedCreateWithoutUserInput[]
}

function normalizeEmail(email: string): string {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
        throw new BadRequestError("Email cannot be empty");
    }
    // The domain is reserved for machine accounts (src/lib/auth/machineAccounts.ts).
    if (isMachineAccountAddress(normalizedEmail)) {
        throw new BadRequestError("This address is reserved for machine accounts");
    }
    return normalizedEmail;
}

const MACHINE_ACCOUNT_RETIRE_HINT = "A machine account is retired by revoking its tokens, not deleted";

function normalizeName(name: string | null | undefined): string | null {
    if (typeof name !== "string") {
        return null;
    }

    const normalizedName = name.trim();
    return normalizedName ? normalizedName : null;
}

function normalizeAdminUserData(data: AdminUserData): AdminUserData {
    const normalizedData: AdminUserData = { ...data };

    if (typeof data.email === "string") {
        normalizedData.email = normalizeEmail(data.email);
    }

    if (data.name !== undefined) {
        normalizedData.name = normalizeName(data.name);
    }

    return normalizedData;
}

export async function getUsers(): Promise<UserWithRelations[]> {
    await withUserAuthorizedToEdit({});
    try {
        const users = await prisma.user.findMany({
            where: peopleOnly,
            include: userWithRelationsInclude,
            orderBy: {
                createdAt: 'desc'
            }
        });
        return users;
    } catch (error) {
        console.error("Failed to fetch users:", error);
        throw new Error('Failed to fetch users');
    }
}

export async function createUser(data: AdminUserData, options: { skipAuthCheck?: boolean } = {}): Promise<UserWithAdministers> {
    // `skipAuthCheck` exists only for dev/preview seeding (seed-test-users). This
    // is a "use server" module, so a client can pass options directly — honoring
    // the bypass in production would let anyone create a superadmin. Gate it
    // behind DEV_TOOLS_ALLOWED so it is inert on real production.
    if (options.skipAuthCheck && !devToolsAllowed()) {
        throw new Error("skipAuthCheck is only permitted when dev tools are enabled");
    }
    if (!options.skipAuthCheck) {
        await withUserAuthorizedToEdit({});
    }

    const normalizedData = normalizeAdminUserData(data);
    if (!normalizedData.email) {
        throw new BadRequestError("Email is required to create a user");
    }

    const { email, name, isSuperAdmin, administers, onboarded } = normalizedData;

    try {
        const newUser = await prisma.user.create({
            data: {
                email,
                name,
                isSuperAdmin,
                onboarded,
                administers: {
                    create: administers
                }
            },
            include: userWithAdministersInclude
        });
        return newUser;
    } catch (error) {
        const errorWithCode = error as { code?: string };
        if (errorWithCode.code === "P2002") {
            throw new ConflictError("A user with this email already exists.");
        }
        console.error("Failed to create user:", error);
        throw new Error("Failed to create user");
    }
}

export async function updateUser(id: string, data: AdminUserData): Promise<UserWithAdministers> {
    await withUserAuthorizedToEdit({});

    const normalizedData = normalizeAdminUserData(data);

    if (normalizedData.email === null) {
        throw new BadRequestError("Email cannot be null");
    }

    // Explicit fields: a direct call of this Server Action may pass any
    // column, and isMachine must never change after the create.
    const { administers, email, name, isSuperAdmin, onboarded } = normalizedData;
    const userData = { email, name, isSuperAdmin, onboarded };

    // A machine account's address comes from its label and never changes.
    if (userData.email !== undefined && await findMachineAccount(id)) {
        throw new BadRequestError("The address of a machine account cannot change");
    }

    try {
        if (administers) {
            const updatedUser = await prisma.$transaction(async (tx) => {
                // The rows are recreated from the form, which knows nothing of
                // claimedAt. A person the form keeps stays claimed; only the
                // person's own scan can set it, so the form must not lose it.
                const claimed = await tx.administers.findMany({
                    where: { userId: id, ...claimedLink },
                    select: { personId: true, claimedAt: true },
                });
                const claimedAtByPerson = new Map(claimed.map((row) => [row.personId, row.claimedAt]));
                await tx.administers.deleteMany({ where: { userId: id } });
                return tx.user.update({
                    where: { id },
                    data: {
                        ...userData,
                        administers: {
                            create: administers.map((row) =>
                                row.personId && claimedAtByPerson.has(row.personId)
                                    ? { ...row, claimedAt: claimedAtByPerson.get(row.personId) }
                                    : row,
                            ),
                        },
                    },
                    include: userWithAdministersInclude,
                });
            });
            return updatedUser;
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: userData,
            include: userWithAdministersInclude,
        });
        return updatedUser;
    } catch (error) {
        const errorWithCode = error as { code?: string };
        if (errorWithCode.code === "P2002") {
            throw new ConflictError("A user with this email already exists.");
        }
        if (errorWithCode.code === "P2025") {
            throw new NotFoundError("User not found");
        }
        console.error("Failed to update user:", error);
        throw new Error("Failed to update user");
    }
}

export async function deleteUser(id: string): Promise<void> {
    await withUserAuthorizedToEdit({});
    // The account is the attribution of the highlights its tokens created
    // (Highlight.createdBy is SetNull on delete), so it stays.
    if (await findMachineAccount(id)) throw new ConflictError(MACHINE_ACCOUNT_RETIRE_HINT);
    try {
        await prisma.user.delete({
            where: { id },
        });
    } catch (error) {
        const errorWithCode = error as { code?: string };
        if (errorWithCode.code === "P2025") {
            throw new NotFoundError("User not found");
        }
        console.error("Failed to delete user:", error);
        throw new Error("Failed to delete user");
    }
}

export async function deleteCurrentUser(): Promise<void> {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    if (user.isMachine) throw new ConflictError(MACHINE_ACCOUNT_RETIRE_HINT);
    await prisma.user.delete({ where: { id: user.id } });
}

