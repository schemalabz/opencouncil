"use server";

import prisma from '@/lib/db/prisma';
import { startTask } from './tasks';
import { GenerateHighlightRequest, GenerateHighlightResult } from '@/lib/apiTypes';
import { getPartyFromRoles, isRoleActiveAt, getSingleCityRole } from '@/lib/utils';
import { canViewHighlight } from '@/lib/db/highlights';

export async function requestGenerateHighlight(
    highlightId: string,
    options?: Pick<GenerateHighlightRequest['render'], 'includeCaptions' | 'includeSpeakerOverlay' | 'aspectRatio' | 'socialOptions'> & { 
        force?: boolean;
    }
) {
    const highlight = await prisma.highlight.findUnique({
        where: { id: highlightId },
        include: {
            meeting: true,
            highlightedUtterances: {
                orderBy: {
                    utterance: {
                        startTimestamp: 'asc'
                    }
                },
                include: {
                    utterance: {
                        include: {
                            speakerSegment: {
                                include: {
                                    speakerTag: {
                                        include: {
                                                                                person: {
                                        include: {
                                            roles: {
                                                include: { party: true },
                                            },
                                        },
                                    },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!highlight) {
        throw new Error('Highlight not found');
    }

    const authorized = await canViewHighlight({ 
        cityId: highlight.cityId, 
        createdById: highlight.createdById 
    });
    
    if (!authorized) {
        throw new Error('Not authorized to generate this highlight');
    }

    if (!highlight.meeting.videoUrl) {
        throw new Error('Meeting media not found: videoUrl is required');
    }

    const utterances = highlight.highlightedUtterances.map(hu => {
        const u = hu.utterance;
        const speakerTag = u.speakerSegment.speakerTag;
        const person = speakerTag.person;
        
        let partyColorHex: string | undefined;
        let partyLabel: string | undefined;
        let roleLabel: string | undefined;
        
        if (person && person.roles) {
            // Use the utility function to get the active party at the meeting date
            const party = getPartyFromRoles(person.roles, highlight.meeting.dateTime);
            if (party) {
                partyColorHex = party.colorHex || undefined;
                partyLabel = party.name_short || party.name;
            }
            
            // For role label, prioritize city/administrative roles for non-party speakers
            const cityRole = getSingleCityRole(person.roles, highlight.meeting.dateTime, highlight.meeting.administrativeBodyId || undefined);
            if (cityRole) {
                roleLabel = cityRole.name || undefined;
            } else {
                // Fallback to any active role if no city role found
                const activeRole = person.roles.find(role => isRoleActiveAt(role, highlight.meeting.dateTime));
                roleLabel = activeRole?.name || undefined;
            }
        }
        
        return {
            utteranceId: u.id,
            startTimestamp: u.startTimestamp,
            endTimestamp: u.endTimestamp,
            text: u.text,
            speaker: {
                id: person?.id,
                name: person?.name || speakerTag.label || undefined,
                partyColorHex,
                partyLabel,
                roleLabel,
            },
        };
    });

    const requestBody: Omit<GenerateHighlightRequest, 'callbackUrl'> = {
        media: {
            type: 'video',
            videoUrl: highlight.meeting.videoUrl,
        },
        parts: [
            {
                id: highlight.id,
                utterances,
            },
        ],
        render: {
            includeCaptions: options?.includeCaptions,
            includeSpeakerOverlay: options?.includeSpeakerOverlay,
            aspectRatio: options?.aspectRatio || 'default',
            ...(options?.aspectRatio === 'social-9x16' && options?.socialOptions && {
                socialOptions: options.socialOptions
            }),
        },
    };

    return startTask('generateHighlight', requestBody, highlight.meetingId, highlight.cityId, { force: options?.force });
}

export async function handleGenerateHighlightResult(taskId: string, result: GenerateHighlightResult) {
    // Process the first part (we only send one part per highlight)
    if (result.parts && result.parts.length > 0) {
        const part = result.parts[0];
        await prisma.highlight.update({
            where: { id: part.id },
            data: {
                videoUrl: part.url,
                ...(part.muxPlaybackId ? { muxPlaybackId: part.muxPlaybackId } : {}),
            },
        });
    }
} 