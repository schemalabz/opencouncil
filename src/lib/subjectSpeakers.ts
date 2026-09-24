import type { PersonWithRelations } from '@/lib/db/people';
import type { Statistics } from '@/lib/statistics';

const MAX_TOP_SPEAKERS = 5;

/** The subject's top speakers by speaking time, as the statistics carry them. */
function topSpeakers(statistics: Statistics | undefined): PersonWithRelations[] {
    return [...(statistics?.people ?? [])]
        .sort((a, b) => b.speakingSeconds - a.speakingSeconds)
        .slice(0, MAX_TOP_SPEAKERS)
        .map(p => p.item);
}

/**
 * The people a subject shows on its avatar row: the introducer first, then the
 * top speakers by speaking time, straight out of the statistics. Server-side
 * statistics carry each speaker with their roles, so no roster is needed.
 */
export function subjectSpeakersFromStatistics(
    statistics: Statistics | undefined,
    introducedBy: PersonWithRelations | null | undefined,
): PersonWithRelations[] {
    const ranked = topSpeakers(statistics);
    if (!introducedBy) return ranked;
    return [introducedBy, ...ranked.filter(speaker => speaker.id !== introducedBy.id)];
}

/**
 * The same row, resolved against `persons` (the city roster) instead: for the
 * client, where the statistics arrive with a thinner person record.
 */
export function subjectDisplayedSpeakers(
    subject: { statistics?: Statistics; introducedBy?: PersonWithRelations | null },
    persons: PersonWithRelations[],
): PersonWithRelations[] {
    const introducerId = subject.introducedBy?.id;
    const topSpeakerIds = topSpeakers(subject.statistics)
        .map(speaker => speaker.id)
        .filter(id => id !== introducerId);
    const ids = introducerId ? [introducerId, ...topSpeakerIds] : topSpeakerIds;

    return ids
        .map(id => persons.find(p => p.id === id))
        .filter((p): p is PersonWithRelations => p !== undefined);
}
