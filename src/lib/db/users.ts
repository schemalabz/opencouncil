"use server";

import { Prisma, User } from "@prisma/client";
import prisma from "./prisma";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api/errors";
import { withUserAuthorizedToEdit, getCurrentUser } from "../auth";
import { isMachineAccountAddress } from "@/lib/auth/machineAccounts";
import { findMachineAccount } from "@/lib/db/machineAccounts";
import { acceptedAtFor, activeGrantWhere, DUPLICATE_GRANT_MESSAGE, isDuplicateGrant } from "@/lib/auth/grants.server";
import { namedScope, scopeLabel, type NamedScope } from "@/lib/auth/grantScope";
import { sendAccountDeletedAdminAlert } from "@/lib/discord";
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

/** A grant the admin form asks for: a role (admin when absent) at one scope. */
type GrantInput = Pick<Prisma.AdministersUncheckedCreateWithoutUserInput, 'role' | 'realm' | 'cityId' | 'partyId' | 'personId' | 'administrativeBodyId'>;

export type AdminUserData = Partial<Pick<User, 'email' | 'name' | 'isSuperAdmin' | 'onboarded'>> & {
    administers?: GrantInput[]
}

/** The identity of a grant: its role and its one scope. Two rows with the same key are the same grant. */
const grantKey = (row: GrantInput): string =>
    [row.role ?? 'admin', row.realm ?? '', row.cityId ?? '', row.partyId ?? '', row.personId ?? '', row.administrativeBodyId ?? ''].join('|');

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

export async function createUser(data: AdminUserData): Promise<UserWithAdministers> {
    await withUserAuthorizedToEdit({});

    const normalizedData = normalizeAdminUserData(data);
    if (!normalizedData.email) {
        throw new BadRequestError("Email is required to create a user");
    }

    const { email, name, isSuperAdmin, administers, onboarded } = normalizedData;
    const actor = await getCurrentUser();

    try {
        const newUser = await prisma.user.create({
            data: {
                email,
                name,
                isSuperAdmin,
                onboarded,
                administers: {
                    create: administers?.map((row) => ({ ...row, acceptedAt: null, grantedById: actor?.id }))
                }
            },
            include: userWithAdministersInclude
        });
        return newUser;
    } catch (error) {
        if (isDuplicateGrant(error)) {
            throw new ConflictError(DUPLICATE_GRANT_MESSAGE);
        }
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
            const actor = await getCurrentUser();
            const now = new Date();
            const updatedUser = await prisma.$transaction(async (tx) => {
                // A diff against the rows, not a rewrite: a grant the form keeps
                // stays, with its claimedAt, its grantedBy and its dates; a grant
                // the form drops is revoked, not deleted, so the history stays.
                const existing = await tx.administers.findMany({
                    where: { userId: id, revokedAt: null },
                    select: { id: true, role: true, realm: true, cityId: true, partyId: true, personId: true, administrativeBodyId: true, claimedAt: true },
                });
                const wanted = new Map(administers.map((row) => [grantKey(row), row]));
                const kept = new Set<string>();
                const dropped: string[] = [];
                // The role is part of the key, so a new role on a claimed person
                // drops the claimed row: the claim moves to the new row, or the
                // person could be claimed again by anyone with the QR code.
                const droppedClaims = new Map<string, Date>();
                for (const row of existing) {
                    const key = grantKey(row);
                    if (wanted.has(key)) kept.add(key);
                    else {
                        dropped.push(row.id);
                        if (row.personId && row.claimedAt) droppedClaims.set(row.personId, row.claimedAt);
                    }
                }
                if (dropped.length > 0) {
                    await tx.administers.updateMany({
                        where: { id: { in: dropped } },
                        data: { revokedAt: now, revokedById: actor?.id },
                    });
                }
                // A row takes effect at once for an account that signed in
                // before; else it waits, pending, for the first sign-in.
                const acceptedAt = await acceptedAtFor(tx, id, now);
                const added = [...wanted]
                    .filter(([key]) => !kept.has(key))
                    .map(([, row]) => {
                        const claimedAt = row.personId ? droppedClaims.get(row.personId) : undefined;
                        if (row.personId) droppedClaims.delete(row.personId);
                        return { ...row, acceptedAt, grantedById: actor?.id, ...(claimedAt ? { claimedAt } : {}) };
                    });
                // No new row for the person: the claim moves to a row the form
                // keeps. The index allows one active claimed row per person.
                for (const [personId, claimedAt] of droppedClaims) {
                    const keptRow = existing.find((row) => row.personId === personId && kept.has(grantKey(row)));
                    if (keptRow) await tx.administers.update({ where: { id: keptRow.id }, data: { claimedAt } });
                }
                return tx.user.update({
                    where: { id },
                    data: { ...userData, administers: { create: added } },
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
        if (isDuplicateGrant(error)) {
            throw new ConflictError(DUPLICATE_GRANT_MESSAGE);
        }
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

const heldRoleSelect = {
    role: true,
    realm: true,
    city: { select: { id: true, name: true } },
    administrativeBody: { select: { id: true, name: true, cityId: true, city: { select: { name: true } } } },
    party: { select: { id: true, name: true, cityId: true, city: { select: { name: true } } } },
    person: { select: { id: true, name: true, cityId: true, city: { select: { name: true } } } },
} satisfies Prisma.AdministersSelect;

/**
 * The scope as the deletion alert names it. A person's name is personal
 * data, and the alert goes to a Discord channel: it names the city only.
 */
const alertScope = (scope: NamedScope): string =>
    scope.kind === 'person' ? scopeLabel({ ...scope, name: 'A person' }) : scopeLabel(scope);

/**
 * Delete the account. Its grant rows go with it (the cascade on `userId`),
 * and the account is personal data, so nothing of it stays: the alert is
 * the trace of the roles it held. Read before the delete, posted after it,
 * so the alert reports a deletion that happened.
 */
async function deleteAccount(id: string, deletedBy: 'self' | 'superadmin'): Promise<void> {
    const held = await prisma.administers.findMany({ where: { userId: id, ...activeGrantWhere }, select: heldRoleSelect });
    await prisma.user.delete({ where: { id } });
    if (held.length === 0) return;
    await sendAccountDeletedAdminAlert({
        deletedBy,
        roles: held.map((row) => ({ role: row.role, scope: alertScope(namedScope(row)) })),
    });
}

export async function deleteUser(id: string): Promise<void> {
    await withUserAuthorizedToEdit({});
    // The account is the attribution of the highlights its tokens created
    // (Highlight.createdBy is SetNull on delete), so it stays.
    if (await findMachineAccount(id)) throw new ConflictError(MACHINE_ACCOUNT_RETIRE_HINT);
    try {
        await deleteAccount(id, 'superadmin');
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
    await deleteAccount(user.id, 'self');
}

