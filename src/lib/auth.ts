"use server";
import { type City, type Party, type Person, type CouncilMeeting, type User } from "@prisma/client";
import { auth } from "@/auth";
import prisma from "@/lib/db/prisma";
import { randomBytes, randomUUID } from "crypto";
import { renderReactEmailToHtml } from "@/lib/email/render";
import { AuthEmail } from "@/lib/email/templates/AuthEmail";

export async function getCurrentUser() {
    const session = await auth();
    if (!session?.user?.email) return null;

    return prisma.user.findUnique({
        where: { email: session.user.email },
        include: {
            administers: {
                include: {
                    city: true,
                    party: true,
                    person: true
                }
            }
        }
    });
}
async function checkUserAuthorization({
    cityId,
    partyId,
    personId,
    councilMeetingId
}: {
    cityId?: City["id"],
    partyId?: Party["id"],
    personId?: Person["id"],
    councilMeetingId?: CouncilMeeting["id"]
}) {
    const definedParams = [cityId, partyId, personId, councilMeetingId].filter(Boolean);
    if (definedParams.length > 1) {
        throw new Error("Only one of cityId, partyId, personId, or councilMeetingId should be defined");
    }

    const user = await getCurrentUser();
    if (!user) return false;

    // Superadmins can edit everything
    if (user.isSuperAdmin) return true;

    if (!cityId && !partyId && !personId && !councilMeetingId) {
        return false; // Only superadmins can edit anything
    }

    // Check direct administration rights
    const hasDirectAccess = user.administers.some(a =>
        (cityId && a.cityId === cityId) ||
        (partyId && a.partyId === partyId) ||
        (personId && a.personId === personId)
    );

    if (hasDirectAccess) return true;

    // Check hierarchical rights
    if (partyId || personId || councilMeetingId) {
        // Get the city for the entity
        const entity = partyId ? await prisma.party.findUnique({ where: { id: partyId }, select: { cityId: true } })
            : personId ? await prisma.person.findUnique({ where: { id: personId }, select: { cityId: true } })
                : councilMeetingId ? await prisma.councilMeeting.findFirst({ where: { id: councilMeetingId }, select: { cityId: true } })
                    : null;

        if (entity?.cityId) {
            // If user administers the city, they can edit everything in it
            const hasAccess = user.administers.some(a => a.cityId === entity.cityId);
            if (hasAccess) return true;
        }
    }

    return false;
}

export async function withUserAuthorizedToEdit({
    cityId,
    partyId,
    personId,
    councilMeetingId
}: {
    cityId?: City["id"],
    partyId?: Party["id"],
    personId?: Person["id"],
    councilMeetingId?: CouncilMeeting["id"]
}) {
    const isAuthorized = await checkUserAuthorization({
        cityId,
        partyId,
        personId,
        councilMeetingId
    });

    if (!isAuthorized) {
        throw new Error("Not authorized");
    }

    return true;
}

export async function isUserAuthorizedToEdit({
    cityId,
    partyId,
    personId,
    councilMeetingId
}: {
    cityId?: City["id"],
    partyId?: Party["id"],
    personId?: Person["id"],
    councilMeetingId?: CouncilMeeting["id"]
}) {
    return checkUserAuthorization({
        cityId,
        partyId,
        personId,
        councilMeetingId
    });
}