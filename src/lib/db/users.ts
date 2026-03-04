"use server";

import { Prisma, User } from "@prisma/client";
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { BadRequestError, ConflictError } from "@/lib/api/errors";

const userWithAdministersInclude = {
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
            }
        }
    }
} satisfies Prisma.UserInclude;

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


export type UserWithAdministers = Prisma.UserGetPayload<{ include: typeof userWithAdministersInclude }>;
export type UserWithRelations = Prisma.UserGetPayload<{ include: typeof userWithRelationsInclude }>;

export type AdminUserData = Partial<Pick<User, 'email' | 'name' | 'isSuperAdmin' | 'onboarded'>> & {
    administers?: Prisma.AdministersCreateWithoutUserInput[]
}

function normalizeEmail(email: string): string {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
        throw new BadRequestError("Email cannot be empty");
    }
    return normalizedEmail;
}

function normalizeName(name: string | null | undefined): string | null | undefined {
    if (typeof name !== "string") {
        return name;
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
            include: userWithRelationsInclude,
            orderBy: {
                createdAt: 'desc'
            }
        });
        return users;
    } catch (error) {
        console.error('Error fetching users:', error);
        throw new Error('Failed to fetch users');
    }
}

export async function createUser(data: AdminUserData, options: { skipAuthCheck?: boolean } = {}): Promise<UserWithAdministers> {
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
        throw error;
    }
}

export async function updateUser(id: string, data: AdminUserData): Promise<UserWithAdministers> {
    await withUserAuthorizedToEdit({});

    const normalizedData = normalizeAdminUserData(data);
    const { administers, ...userData } = normalizedData;

    try {
        if (administers) {
            const [_, updatedUser] = await prisma.$transaction([
                // First delete all existing administers relations
                prisma.administers.deleteMany({ where: { userId: id } }),
                // Then update the user with new data
                prisma.user.update({
                    where: { id },
                    data: {
                        ...userData,
                        administers: { create: administers }
                    },
                    include: userWithAdministersInclude
                })
            ]);
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
        throw error;
    }
}

export async function deleteUser(id: string): Promise<void> {
    await withUserAuthorizedToEdit({});
    try {
        await prisma.user.delete({
            where: { id },
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        throw error;
    }
}

export type UserProfileUpdateData = Partial<Pick<User, 'name' | 'phone' | 'allowContact' | 'onboarded'>>;

export async function updateUserProfile(id: string, data: UserProfileUpdateData): Promise<User> {
    try {
        const updatedUser = await prisma.user.update({
            where: { id },
            data,
        });
        return updatedUser;
    } catch (error) {
        console.error('Error updating user profile:', error);
        throw new Error('Failed to update user profile');
    }
}
