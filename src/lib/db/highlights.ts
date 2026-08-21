"use server";
import { City, CouncilMeeting, Highlight, Subject, Utterance, Prisma } from '@prisma/client';
import prisma from "./prisma";
import { getCurrentUser, isUserAuthorizedToEdit, withUserAuthorizedToEdit } from "../auth";
import { UnauthorizedError, ForbiddenError, NotFoundError, BadRequestError } from "../api/errors";
import {
    highlightWithUtterancesInclude,
    highlightWithMeetingInclude,
    getHighlightStatistics,
    upsertHighlightCore,
    MY_HIGHLIGHTS_LIMIT,
    type HighlightWithUtterances,
    type HighlightWithMeetingAndStatistics
} from "./highlights-core";

export type {
    HighlightWithUtterances,
    HighlightWithMeeting,
    HighlightWithMeetingAndStatistics,
    HighlightStatistics
} from "./highlights-core";

/** A page of the signed-in user's highlights, newest meeting first. */
export type MyHighlights = {
    highlights: HighlightWithMeetingAndStatistics[];
    /** The user has more highlights than this page holds. */
    truncated: boolean;
};

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

/**
 * All highlights the signed-in user created, across every city and meeting.
 * The identity comes from the session, never from a parameter: this module
 * is "use server", so a userId argument would let any client read the
 * highlights of any user.
 *
 * A highlight on an unreleased meeting stays hidden, the same rule
 * getCouncilMeeting applies: the meeting page 404s for anyone who cannot edit
 * the city, so listing the highlight would only show a dead link and the name
 * and date of a draft meeting.
 */
export async function getMyHighlights(): Promise<MyHighlights> {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new UnauthorizedError("You must be signed in to list your highlights");
    }

    const editableCityIds = currentUser.administers
        .map(administers => administers.cityId)
        .filter((cityId): cityId is string => cityId !== null);

    const visibleMeetings: Prisma.HighlightWhereInput = currentUser.isSuperAdmin
        ? {}
        : {
            OR: [
                { meeting: { released: true } },
                ...(editableCityIds.length > 0 ? [{ cityId: { in: editableCityIds } }] : [])
            ]
        };

    // Meeting date first so the page can group by meeting in render order,
    // then updatedAt to order the cards inside each group.
    const found = await prisma.highlight.findMany({
        where: { createdById: currentUser.id, ...visibleMeetings },
        include: highlightWithMeetingInclude,
        orderBy: [
            { meeting: { dateTime: 'desc' } },
            { updatedAt: 'desc' }
        ],
        // One over the limit, to tell a full page from a truncated one.
        take: MY_HIGHLIGHTS_LIMIT + 1
    });

    const truncated = found.length > MY_HIGHLIGHTS_LIMIT;
    const highlights = truncated ? found.slice(0, MY_HIGHLIGHTS_LIMIT) : found;
    const statistics = await getHighlightStatistics(highlights.map(highlight => highlight.id));

    return {
        highlights: highlights.map(highlight => ({
            ...highlight,
            statistics: statistics.get(highlight.id)
                ?? { duration: 0, utteranceCount: 0, speakerCount: 0 }
        })),
        truncated
    };
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