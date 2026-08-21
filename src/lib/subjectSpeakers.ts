import type { PersonWithRelations } from '@/lib/db/people';
import type { Statistics } from '@/lib/statistics';

const MAX_TOP_SPEAKERS = 5;

/**
 * The people a subject shows on its avatar row: the introducer first, then the
 * top speakers by speaking time. Every entry is resolved against `persons` (the
 * city roster), because the statistics carry a thinner person record.
 */
export function subjectDisplayedSpeakers(
    subject: { statistics?: Statistics; introducedBy?: PersonWithRelations | null },
    persons: PersonWithRelations[],
): PersonWithRelations[] {
    const introducerId = subject.introducedBy?.id;

    const topSpeakerIds = [...(subject.statistics?.people ?? [])]
        .sort((a, b) => b.speakingSeconds - a.speakingSeconds)
        .slice(0, MAX_TOP_SPEAKERS)
        .map(p => p.item.id)
        .filter(id => id !== introducerId);

    const ids = introducerId ? [introducerId, ...topSpeakerIds] : topSpeakerIds;

    return ids
        .map(id => persons.find(p => p.id === id))
        .filter((p): p is PersonWithRelations => p !== undefined);
}
