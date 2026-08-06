"use server";
import { City, CouncilMeeting, Highlight, Subject, Utterance, Prisma } from '@prisma/client';
import prisma from "./prisma";
import { getCurrentUser, isUserAuthorizedToEdit, withUserAuthorizedToEdit } from "../auth";
import { UnauthorizedError, ForbiddenError, NotFoundError, BadRequestError } from "../api/errors";
import { highlightWithUtterancesInclude, upsertHighlightCore, type HighlightWithUtterances } from "./highlights-core";

export type { HighlightWithUtterances } from "./highlights-core";

/**
 * Gets the current user's permission context for highlights.
 * Returns null if not authenticated, otherwise returns user permissions.
 */
export async function getHighlightPermissions(cityId: City["id"]) {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
        return null;
    }
    
    const canEditCity = await isUserAuthorizedToEdit({ cityId });
    
    return {
        userId: currentUser.id,
        canEditCity
    };
}

/**
 * Helper to check if the current user can view a highlight.
 * Returns true if user is authorized, false otherwise.
 */
export async function canViewHighlight(highlight: { cityId: string; createdById: string | null }): Promise<boolean> {
    const permissions = await getHighlightPermissions(highlight.cityId);
    
    // Not logged in = can't see anything
    if (!permissions) return false;
    
    // City editors (including super admins) see everything
    if (permissions.canEditCity) return true;
    
    // Regular users see only their own highlights
    return highlight.createdById === permissions.userId;
}

export async function getHighlight(
    id: Highlight["id"]
): Promise<HighlightWithUtterances | null> {
    const highlight = await prisma.highlight.findUnique({
        where: { id },
        include: highlightWithUtterancesInclude
    });

    if (!highlight) {
        return null;
    }

    // Check if user is authorized to view this highlight
    const authorized = await canViewHighlight(highlight);
    return authorized ? highlight : null;
}

export async function getHighlightsForMeeting(
    cityId: City["id"],
    meetingId: CouncilMeeting["id"]
): Promise<HighlightWithUtterances[]> {
    const permissions = await getHighlightPermissions(cityId);
    
    // Not logged in = no highlights
    if (!permissions) {
        return [];
    }

    // Build where clause based on permissions
    const where: Prisma.HighlightWhereInput = {
        cityId,
        meetingId
    };

    // City editors (including super admins) see all highlights
    // Regular users only see their own
    if (!permissions.canEditCity) {
        where.createdById = permissions.userId;
    }

    return prisma.highlight.findMany({
        where,
        include: highlightWithUtterancesInclude,
        orderBy: { updatedAt: 'desc' }
    });
}

export async function upsertHighlight(
    highlightData: {
        id?: Highlight["id"];
        name?: string;
        meetingId: CouncilMeeting["id"];
        cityId: City["id"];
        utteranceIds: Utterance["id"][];
        subjectId?: Subject["id"] | null;
    }
): Promise<HighlightWithUtterances> {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new UnauthorizedError('Authentication required');
    }

    return upsertHighlightCore({ type: 'user', userId: currentUser.id }, highlightData);
}

export async function deleteHighlight(id: Highlight["id"]) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new UnauthorizedError('Authentication required');
    }

    const highlight = await prisma.highlight.findUnique({
        where: { id },
        select: { cityId: true, createdById: true }
    });

    if (!highlight) {
        throw new NotFoundError('Highlight not found');
    }

    // Check authorization: city editors or owner can delete
    const canEditCity = await isUserAuthorizedToEdit({ cityId: highlight.cityId });
    const isOwner = highlight.createdById === currentUser.id;

    if (!canEditCity && !isOwner) {
        throw new ForbiddenError('Not authorized to delete this highlight');
    }

    await prisma.highlight.delete({ where: { id } });
}


export async function toggleHighlightShowcase(id: Highlight["id"]) {
    const highlight = await prisma.highlight.findUnique({
        where: { id },
        select: { isShowcased: true, muxPlaybackId: true, cityId: true }
    });

    if (!highlight) {
        throw new NotFoundError('Highlight not found');
    }

    await withUserAuthorizedToEdit({ cityId: highlight.cityId });

    if (!highlight.muxPlaybackId) {
        throw new BadRequestError('Cannot showcase highlight without video');
    }

    return prisma.highlight.update({
        where: { id },
        data: { isShowcased: !highlight.isShowcased }
    });
}