"use server";
import { City, CouncilMeeting, Highlight, Subject, Utterance, Prisma } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";

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
    }
} satisfies Prisma.HighlightInclude;

// Define the type using the include structure
// This ensures type safety and makes the query structure explicit
export type HighlightWithUtterances = Prisma.HighlightGetPayload<{ 
    include: typeof highlightWithUtterancesInclude 
}>;

export async function getHighlight(id: Highlight["id"]): Promise<HighlightWithUtterances | null> {
    try {
        const highlight = await prisma.highlight.findUnique({
            where: { id },
            include: highlightWithUtterancesInclude
        });
        return highlight;
    } catch (error) {
        console.error('Error fetching highlight:', error);
        throw new Error('Failed to fetch highlight');
    }
}

export async function getHighlightsForMeeting(cityId: City["id"], meetingId: CouncilMeeting["id"]): Promise<HighlightWithUtterances[]> {
    try {
        const highlights = await prisma.highlight.findMany({
            where: {
                cityId,
                meetingId
            },
            include: highlightWithUtterancesInclude,
            orderBy: {
                updatedAt: 'desc'
            }
        });
        return highlights;
    } catch (error) {
        console.error('Error fetching highlights for meeting:', error);
        throw new Error('Failed to fetch highlights for meeting');
    }
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

    await withUserAuthorizedToEdit({ cityId });

    // Generate auto name if no name provided
    const finalName = name || "Unnamed Highlight";

    // Common data for both operations
    const commonData = {
        name: finalName,
        highlightedUtterances: {
            create: utteranceIds.map(utteranceId => ({
                utterance: { connect: { id: utteranceId } }
            }))
        }
    };

    // Prepare update data with subject handling
    const updateData = { ...commonData };
    if (subjectId !== undefined) {
        (updateData as any).subject = subjectId ? { connect: { id: subjectId } } : { disconnect: true };
    }

    // Prepare create data with subject handling
    const createData = { ...commonData };
    if (subjectId !== undefined && subjectId !== null) {
        (createData as any).subject = { connect: { id: subjectId } };
    }
    // Note: If subjectId is null, we don't set the subject field in create (it will be null by default)

    try {
        const highlight = await prisma.highlight.upsert({
            where: { id: id || 'new' }, // Use 'new' as placeholder for new records
            update: {
                ...updateData,
                highlightedUtterances: {
                    deleteMany: {}, // Only for updates - delete existing records
                    ...updateData.highlightedUtterances
                }
            },
            create: {
                ...createData,
                meeting: { connect: { cityId_id: { id: meetingId, cityId } } }
            },
            include: highlightWithUtterancesInclude
        });

        return highlight;
    } catch (error) {
        console.error('Error upserting highlight:', error);
        throw new Error('Failed to upsert highlight');
    }
}

export async function deleteHighlight(id: Highlight["id"]) {
    try {
        await prisma.highlight.delete({ where: { id } });
    } catch (error) {
        console.error('Error deleting highlight:', error);
        throw new Error('Failed to delete highlight');
    }
}


export async function toggleHighlightShowcase(id: Highlight["id"]) {
    try {
        const highlight = await prisma.highlight.findUnique({
            where: { id },
            select: { isShowcased: true, muxPlaybackId: true, cityId: true }
        });

        if (!highlight) {
            throw new Error('Highlight not found');
        }

        await withUserAuthorizedToEdit({ cityId: highlight.cityId });

        if (!highlight.muxPlaybackId) {
            throw new Error('Cannot showcase highlight without video');
        }

        const updatedHighlight = await prisma.highlight.update({
            where: { id },
            data: { isShowcased: !highlight.isShowcased }
        });

        return updatedHighlight;
    } catch (error) {
        console.error('Error toggling highlight showcase:', error);
        throw new Error('Failed to toggle highlight showcase');
    }
}