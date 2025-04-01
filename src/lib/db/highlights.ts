"use server";
import { City, CouncilMeeting, Highlight, HighlightedUtterance, Subject, Utterance } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";

export type HighlightWithUtterances = Highlight & { highlightedUtterances: HighlightedUtterance[] }

export async function getHighlight(id: CouncilMeeting["id"]): Promise<Highlight & { highlightedUtterances: HighlightedUtterance[] } | null> {
    try {
        const highlight = await prisma.highlight.findUnique({
            where: { id },
            include: {
                highlightedUtterances: {
                    include: {
                        utterance: true
                    }
                }
            }
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
            include: {
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
        name: string;
        meetingId: CouncilMeeting["id"];
        cityId: City["id"];
        utteranceIds: Utterance["id"][];
    }
): Promise<Highlight & { highlightedUtterances: HighlightedUtterance[] }> {
    let { id, name, meetingId, cityId, utteranceIds } = highlightData;

    withUserAuthorizedToEdit({ cityId });

    if (!id) {
        id = await getNewHighlightId();
    }

    try {
        const highlight = await prisma.highlight.upsert({
            where: { id },
            update: {
                name,
                highlightedUtterances: {
                    deleteMany: {},
                    create: utteranceIds.map(utteranceId => ({
                        utterance: { connect: { id: utteranceId } }
                    }))
                }
            },
            create: {
                id,
                name,
                meeting: { connect: { cityId_id: { id: meetingId, cityId } } },
                highlightedUtterances: {
                    create: utteranceIds.map(utteranceId => ({
                        utterance: { connect: { id: utteranceId } }
                    }))
                }
            },
            include: {
                highlightedUtterances: {
                    include: {
                        utterance: true
                    }
                }
            }
        });

        return highlight;
    } catch (error) {
        console.error('Error upserting highlight:', error);
        throw new Error('Failed to upsert highlight');
    }
}

async function getNewHighlightId(): Promise<Highlight["id"]> {
    const generateRandomId = (length: number) => {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    };

    let id: Highlight["id"];
    let length = 3;
    do {
        id = generateRandomId(length);
        const existingHighlight = await prisma.highlight.findUnique({ where: { id } });
        if (!existingHighlight) {
            return id;
        } else {
            length++;
        }
    } while (length < 10);

    throw new Error('Failed to generate a unique highlight id');
}


export async function deleteHighlight(id: Highlight["id"]) {
    try {
        await prisma.highlight.delete({ where: { id } });
    } catch (error) {
        console.error('Error deleting highlight:', error);
        throw new Error('Failed to delete highlight');
    }
}

export async function addHighlightToSubject({ subjectId, highlightId }: { subjectId: Subject["id"], highlightId: Highlight["id"] }) {
    try {
        const updatedHighlight = await prisma.highlight.update({
            where: { id: highlightId },
            data: { subjectId: subjectId },
        });

        return updatedHighlight;
    } catch (error) {
        console.error('Error adding highlight to subject:', error);
        throw new Error('Failed to add highlight to subject');
    }
}

export async function removeHighlightFromSubject({ subjectId, highlightId }: { subjectId: Subject["id"], highlightId: Highlight["id"] }) {
    try {
        await prisma.highlight.update({ where: { id: highlightId }, data: { subjectId: null } });
    } catch (error) {
        console.error('Error removing highlight from subject:', error);
        throw new Error('Failed to remove highlight from subject');
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

        withUserAuthorizedToEdit({ cityId: highlight.cityId });

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