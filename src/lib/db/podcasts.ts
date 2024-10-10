"use server"
import prisma from "./prisma";
import { PodcastSpec, PodcastPart, PodcastPartAudioUtterance, Utterance } from "@prisma/client";

export type PodcastSpecWithRelations = PodcastSpec & {
    parts: (PodcastPart & {
        podcastPartAudioUtterances: (PodcastPartAudioUtterance & {
            utterance: Utterance;
        })[];
    })[];
};

export async function getPodcastSpecsForMeeting(cityId: string, councilMeetingId: string): Promise<PodcastSpecWithRelations[]> {
    try {
        const podcastSpecs = await prisma.podcastSpec.findMany({
            where: {
                cityId,
                councilMeetingId,
            },
            include: {
                parts: {
                    include: {
                        podcastPartAudioUtterances: {
                            include: {
                                utterance: true,
                            },
                        },
                    },
                    orderBy: {
                        index: 'asc',
                    },
                },
            },
        });
        return podcastSpecs;
    } catch (error) {
        console.error('Error fetching podcast specs for meeting:', error);
        throw new Error('Failed to fetch podcast specs for meeting');
    }
}

export async function getPodcastSpec(id: string): Promise<PodcastSpecWithRelations | null> {
    try {
        const podcastSpec = await prisma.podcastSpec.findUnique({
            where: { id },
            include: {
                parts: {
                    include: {
                        podcastPartAudioUtterances: {
                            include: {
                                utterance: true,
                            },
                        },
                    },
                },
            },
        });
        return podcastSpec;
    } catch (error) {
        console.error('Error fetching podcast spec:', error);
        throw new Error('Failed to fetch podcast spec');
    }
}
