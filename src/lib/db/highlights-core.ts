import { City, CouncilMeeting, Highlight, Subject, Utterance, Prisma, HighlightCreationPermission } from '@prisma/client';
import prisma from "./prisma";
import { ForbiddenError, NotFoundError, BadRequestError } from "../api/errors";

// NOT a "use server" module: upsertHighlightCore takes an explicit identity,
// so exposing it as a server action would let clients act as anyone. Only
// trusted server-side callers (the session wrapper in highlights.ts and the
// MCP server) may import it. Same pattern as getAllCitiesAsServiceKey — see
// the warning in src/app/api/cities/route.ts.

// Define the include structure for highlights with utterances
// This includes the highlightedUtterances relation with nested utterance data
// and orders them by startTimestamp for consistent display
export const highlightWithUtterancesInclude = {
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
 * Who is performing a highlight write. Mirrors the shape returned by
 * withServiceOrUserAuth in src/lib/auth.ts: a user acts under their own
 * per-city permissions, a service key acts as a superadmin.
 */
export type HighlightActor =
    | { type: 'user'; userId: string }
    | { type: 'service'; keyName: string };

/**
 * Session-free check of whether a user may edit a city: superadmins may edit
 * everything, otherwise the user must directly administer the city. Same
 * semantics as the cityId branch of checkUserAuthorization in src/lib/auth.ts.
 */
export async function canUserEditCity(userId: string, cityId: City["id"]): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            isSuperAdmin: true,
            administers: { select: { cityId: true } }
        }
    });

    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return user.administers.some(a => a.cityId === cityId);
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

/**
 * Create or update a highlight as the given actor. Service actors bypass
 * per-city permission checks and create unattributed highlights; user actors
 * are constrained by the city's highlightCreationPermission and own only
 * their highlights.
 */
export async function upsertHighlightCore(
    actor: HighlightActor,
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

    const [highlightPermission, canEditCity, existingHighlight] = await Promise.all([
        getCityHighlightPermission(cityId),
        actor.type === 'service' ? Promise.resolve(true) : canUserEditCity(actor.userId, cityId),
        id ? prisma.highlight.findUnique({
            where: { id },
            select: { cityId: true, createdById: true }
        }) : Promise.resolve(null)
    ]);

    // Validate existing highlight
    if (id && !existingHighlight) {
        throw new NotFoundError('Highlight not found');
    }
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
            if (existingHighlight && (actor.type !== 'user' || existingHighlight.createdById !== actor.userId)) {
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

    // Service-created highlights have no owning user (createdById stays null);
    // city editors can see and manage them via canViewHighlight.
    const createdByConnect = actor.type === 'user'
        ? { createdBy: { connect: { id: actor.userId } } }
        : {};

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
            ...createdByConnect,
            highlightedUtterances: { create: utteranceConnections },
            ...(subjectId && { subject: { connect: { id: subjectId } } })
        },
        include: highlightWithUtterancesInclude
    });

    return highlight;
}
