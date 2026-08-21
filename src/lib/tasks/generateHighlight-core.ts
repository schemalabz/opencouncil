import prisma from '@/lib/db/prisma';
import { startTask } from './tasks';
import { GenerateHighlightRequest } from '@/lib/apiTypes';
import { getSpeakerDisplayInfo } from '@/lib/utils';

// NOT a "use server" module: this performs no authorization, so exposing it as
// a server action would let anyone render any highlight. Callers must check
// access first (the session wrapper in generateHighlight.ts uses
// canViewHighlight; the MCP server checks the token's actor). Same pattern as
// src/lib/db/highlights-core.ts.

export type GenerateHighlightOptions = Pick<
    GenerateHighlightRequest['render'],
    'includeCaptions' | 'includeSpeakerOverlay' | 'aspectRatio' | 'captionStyle' | 'socialOptions'
> & {
    force?: boolean;
};

export async function requestGenerateHighlightCore(highlightId: string, options?: GenerateHighlightOptions) {
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
            const { party, role, isIndependent } = getSpeakerDisplayInfo(person.roles, highlight.meeting.dateTime);

            if (party) {
                partyColorHex = party.colorHex || undefined;
                partyLabel = party.name_short || party.name;
            }

            if (role) {
                roleLabel = role.name || undefined;
            } else if (isIndependent) {
                roleLabel = "Ανεξάρτητος Δημοτικός Σύμβουλος";
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
            captionStyle: options?.captionStyle,
            ...(options?.aspectRatio === 'social-9x16' && options?.socialOptions && {
                socialOptions: options.socialOptions
            }),
        },
    };

    return startTask('generateHighlight', requestBody, highlight.meetingId, highlight.cityId, { force: options?.force });
}
