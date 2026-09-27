import type { SpeakerTag } from '@prisma/client';
import type { PersonWithRelations } from '@/lib/db/people';
import { getPartyFromRoles, UNKNOWN_SPEAKER_COLOR } from '@/lib/utils';

/**
 * The name and colour a speaker segment's tag resolves to: the assigned
 * person's short name and party colour, or the tag's own label with the
 * fallback grey when no person is assigned. `BarDataContext` and the caption
 * overlay both derive this from the same segment, so a speaker reads the same
 * name and colour wherever the meeting shows them.
 */
export function resolveSpeakerDisplay(
    speakerTag: SpeakerTag | undefined,
    person: PersonWithRelations | undefined,
    meetingDate: Date,
): { name: string; color: string } {
    const party = person ? getPartyFromRoles(person.roles, meetingDate) : null;
    return {
        name: person ? person.name_short : speakerTag?.label ?? '',
        color: party?.colorHex || UNKNOWN_SPEAKER_COLOR,
    };
}
