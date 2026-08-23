"use server";
import { City, CouncilMeeting, Highlight, HighlightCreationPermission, Subject, Utterance, Prisma } from '@prisma/client';
import prisma from "./prisma";
import { getCurrentUser, isUserAuthorizedToEdit, withUserAuthorizedToEdit } from "../auth";
import { UnauthorizedError, ForbiddenError, NotFoundError, BadRequestError } from "../api/errors";
import {
    highlightWithUtterancesInclude,
    highlightWithMeetingInclude,
    getHighlightStatistics,
    upsertHighlightCore,
    MY_HIGHLIGHTS_LIMIT,
    HIGHLIGHT_NAME_MAX_LENGTH,
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
 * Whether to offer the signed-in user the personal highlights page.
 *
 * True when they can create a highlight somewhere: a superadmin and a city
 * administrator always can, anyone can in a city that opens creation to
 * everyone. Also true when they already hold a highlight, so that a city which
 * closes creation again does not strand the author of one. False for everyone
 * else, who would only ever reach an empty page with no way to fill it.
 */
export async function canAccessMyHighlights(): Promise<boolean> {
    const currentUser = await getCurrentUser();
    if (!currentUser) return false;
    if (currentUser.isSuperAdmin) return true;
    if (currentUser.administers.some(administers => administers.cityId !== null)) return true;

    const openCity = await prisma.city.findFirst({
        where: { highlightCreationPermission: HighlightCreationPermission.EVERYONE },
        select: { id: true }
    });
    if (openCity !== null) return true;

    // The same visibility rule the list applies, so that the link never opens
    // onto a page that filtered everything out.
    const ownHighlight = await prisma.highlight.findFirst({
        where: { createdById: currentUser.id, meeting: { released: true } },
        select: { id: true }
    });

    return ownHighlight !== null;
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

/**
 * Renames a highlight, and nothing else. upsertHighlight also takes a name,
 * but it rewrites the utterance set with the one it is given, which a rename
 * has no business doing.
 */
export async function renameHighlight(
    id: Highlight["id"],
    name: string
): Promise<void> {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new UnauthorizedError('Authentication required');
    }

    const trimmed = name.trim();
    if (trimmed.length === 0) {
        throw new BadRequestError('A highlight needs a name');
    }
    // Highlight.name is unbounded text, and the name travels in the payload of
    // every list that shows the highlight. Cap it here, where a caller reaches
    // the column directly.
    if (trimmed.length > HIGHLIGHT_NAME_MAX_LENGTH) {
        throw new BadRequestError(`A highlight name is at most ${HIGHLIGHT_NAME_MAX_LENGTH} characters`);
    }

    const highlight = await prisma.highlight.findUnique({
        where: { id },
        select: { cityId: true, createdById: true }
    });

    if (!highlight) {
        throw new NotFoundError('Highlight not found');
    }

    // Same rule as deleteHighlight: the author, or an editor of the city.
    const canEditCity = await isUserAuthorizedToEdit({ cityId: highlight.cityId });
    if (!canEditCity && highlight.createdById !== currentUser.id) {
        throw new ForbiddenError('Not authorized to rename this highlight');
    }

    // Returns nothing: the caller only needs to know the rename went through,
    // and reading the utterances back to answer that would be a whole
    // transcript on the wire for a one-column write.
    await prisma.highlight.update({
        where: { id },
        data: { name: trimmed },
        select: { id: true }
    });
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