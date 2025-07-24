"use server";

import { Prisma, User } from "@prisma/client";
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";

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

    if (!data.email) {
        throw new Error("Email is required to create a user");
    }
    
    const { email, name, isSuperAdmin, administers, onboarded } = data;
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
        console.error('Error creating user:', error);
        throw new Error('Failed to create user');
    }
}

export async function updateUser(id: string, data: AdminUserData): Promise<UserWithAdministers> {
    await withUserAuthorizedToEdit({ });
    
    const { administers, ...userData } = data;

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
        console.error('Error updating user:', error);
        throw new Error('Failed to update user');
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