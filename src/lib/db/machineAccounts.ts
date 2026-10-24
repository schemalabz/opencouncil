// Server-only: machine accounts (#590). The callers authorize a superadmin
// first: the users route, and the token actions in src/lib/actions. Keep
// these functions off the Server Action surface.
import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api/errors";
import { machineAccountAddress, machineAccountSlug } from "@/lib/auth/machineAccounts";
import type { CreateMachineAccountInput } from "@/lib/zod-schemas/user";

const machineAccountSelect = {
    id: true,
    name: true,
    email: true,
    isSuperAdmin: true,
    isMachine: true,
} satisfies Prisma.UserSelect;

/** The row behind an id, when it is a machine account; null otherwise. */
export async function findMachineAccount(id: string) {
    return prisma.user.findFirst({ where: { id, isMachine: true }, select: machineAccountSelect });
}

/**
 * The machine account behind an id, for the token actions. The `isMachine`
 * filter keeps a person's tokens out of reach of that surface.
 */
export async function getMachineAccount(id: string) {
    const account = await findMachineAccount(id);
    if (!account) throw new NotFoundError("Machine account not found");
    return account;
}

/**
 * Create a machine account (src/lib/auth/machineAccounts.ts): its address
 * comes from the label, and every consent is off. Its rights are the two
 * things a person has, the superadmin flag and the grants.
 */
export async function createMachineAccount(data: CreateMachineAccountInput) {
    const label = data.label.trim();
    const slug = machineAccountSlug(label);
    if (!slug) {
        throw new BadRequestError("The label needs a Latin letter or a digit");
    }

    try {
        return await prisma.user.create({
            data: {
                email: machineAccountAddress(slug),
                name: label,
                isMachine: true,
                isSuperAdmin: data.isSuperAdmin,
                onboarded: true,
                allowProductUpdates: false,
                allowPetitionUpdates: false,
                allowFeedbackCalls: false,
                notifyByPhone: false,
                administers: {
                    create: data.administers
                }
            },
            select: machineAccountSelect,
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new ConflictError(`A machine account with the address ${machineAccountAddress(slug)} already exists.`);
        }
        console.error("Failed to create machine account:", error);
        throw new Error("Failed to create machine account");
    }
}
