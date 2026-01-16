"use server";
import { City, CouncilMeeting, Highlight, Subject, Utterance, Prisma, HighlightCreationPermission } from '@prisma/client';
import prisma from "./prisma";
import { getCurrentUser, isUserAuthorizedToEdit, withUserAuthorizedToEdit } from "../auth";
import { UnauthorizedError, ForbiddenError, NotFoundError, BadRequestError } from "../api/errors";

// Define the include structure for highlights with utterances
// This includes the highlightedUtterances relation with nested utterance data
// and orders them by startTimestamp for consistent display
const highlightWithUtterancesInclude = {
    highlightedUtterances: {
        include: {
            utterance: true
        },
        orderBy: {
            utterance: {
                startTimestamp: 'asc'
            }
        }
    },
    createdBy: {
        select: {
            id: true,
            name: true,
            email: true
        }
    }
} satisfies Prisma.HighlightInclude;

// Define the type using the include structure
// This ensures type safety and makes the query structure explicit
export type HighlightWithUtterances = Prisma.HighlightGetPayload<{ 
    include: typeof highlightWithUtterancesInclude 
}>;

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

async function getCityHighlightPermission(cityId: City["id"]) {
    const city = await prisma.city.findUnique({
        where: { id: cityId },
        select: { highlightCreationPermission: true }
    });

    if (!city) {
        throw new NotFoundError('City not found');
    }

    return city.highlightCreationPermission;
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
    const { id, name, meetingId, cityId, utteranceIds, subjectId } = highlightData;

    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new UnauthorizedError('Authentication required');
    }

    // Check permissions
    const [highlightPermission, canEditCity, existingHighlight] = await Promise.all([
        getCityHighlightPermission(cityId),
        isUserAuthorizedToEdit({ cityId }),
        id ? prisma.highlight.findUnique({
            where: { id },
            select: { cityId: true, createdById: true }
        }) : Promise.resolve(null)
    ]);

    // Validate existing highlight
    if (existingHighlight && existingHighlight.cityId !== cityId) {
        throw new BadRequestError('Highlight does not belong to the specified city');
    }

    // Authorization checks
    if (highlightPermission === HighlightCreationPermission.ADMINS_ONLY) {
        // ADMINS_ONLY: must be city editor
        if (!canEditCity) {
            throw new ForbiddenError('Not authorized - only city administrators can manage highlights');
        }
    } else {
        // EVERYONE: city editors can edit anything, regular users can only edit their own
        if (!canEditCity) {
            if (existingHighlight && existingHighlight.createdById !== currentUser.id) {
                throw new ForbiddenError('Not authorized to edit this highlight');
            }
            // For new highlights when EVERYONE is allowed, no additional check needed
            // User is authenticated and city allows everyone to create
        }
    }

    // Generate auto name if no name provided
    const finalName = name || "Unnamed Highlight";

    // Prepare utterance connections
    const utteranceConnections = utteranceIds.map(utteranceId => ({
        utterance: { connect: { id: utteranceId } }
    }));

    // Prepare subject connection
    const subjectConnection = subjectId !== undefined
        ? (subjectId ? { connect: { id: subjectId } } : { disconnect: true })
        : undefined;

    const highlight = await prisma.highlight.upsert({
        where: { id: id || 'new' }, // Use 'new' as placeholder for new records
        update: {
            name: finalName,
            highlightedUtterances: {
                deleteMany: {}, // Only for updates - delete existing records
                create: utteranceConnections
            },
            ...(subjectConnection && { subject: subjectConnection })
        },
        create: {
            name: finalName,
            meeting: { connect: { cityId_id: { id: meetingId, cityId } } },
            createdBy: { connect: { id: currentUser.id } },
            highlightedUtterances: { create: utteranceConnections },
            ...(subjectId && { subject: { connect: { id: subjectId } } })
        },
        include: highlightWithUtterancesInclude
    });

    return highlight;
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