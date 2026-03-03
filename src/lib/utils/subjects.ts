import { Statistics } from "../statistics";

/**
 * Minimal interface for speaker segments used for sorting.
 */
export interface MinimalSpeakerSegment {
    startTimestamp?: number | null;
    speakerSegment?: {
        startTimestamp?: number | null;
    } | null;
}

/**
 * Minimal interface for subjects that can be sorted by importance.
 * Only declares the fields actually used by the sorting logic.
 * Any type matching this structure can be sorted.
 */
export interface SortableSubject {
    id?: string;
    name: string;
    hot: boolean;
    // Optional fields used for advanced sorting
    statistics?: Statistics;
    speakerSegments?: MinimalSpeakerSegment[];
    agendaItemIndex?: number | null;
}

export function sortSubjectsByImportance<T extends SortableSubject>(
    subjects: T[],
    orderBy: 'importance' | 'appearance' = 'importance'
) {
    return [...subjects].sort((a, b) => {
        const compareAgendaIndex = () => {
            if (a.agendaItemIndex != null && b.agendaItemIndex != null) {
                return a.agendaItemIndex - b.agendaItemIndex;
            }
            return null;
        };

        // First priority: hot subjects (regardless of ordering mode)
        if (b.hot && !a.hot) return 1;
        if (a.hot && !b.hot) return -1;

        if (orderBy === 'importance') {
            // Second priority: speaking time from statistics
            if (a.statistics && b.statistics) {
                const timeComparison = b.statistics.speakingSeconds - a.statistics.speakingSeconds;
                // Add tie breaker for equal statistics
                if (timeComparison === 0) {
                    // If agenda items exist, use them as first tie breaker
                    const agendaComparison = compareAgendaIndex();
                    if (agendaComparison != null && agendaComparison !== 0) {
                        return agendaComparison;
                    }
                    // If names exist, use alphabetical order as second tie breaker
                    return a.name.localeCompare(b.name);
                }
                return timeComparison;
            } else if (a.statistics && !b.statistics) {
                return -1;
            } else if (!a.statistics && b.statistics) {
                return 1;
            }

            // Alternative for importance: number of speaker segments
            if (a.speakerSegments && b.speakerSegments) {
                const segmentComparison = b.speakerSegments.length - a.speakerSegments.length;
                // Add tie breaker for equal segment counts
                if (segmentComparison === 0) {
                    // If agenda items exist, use them as first tie breaker
                    const agendaComparison = compareAgendaIndex();
                    if (agendaComparison != null && agendaComparison !== 0) {
                        return agendaComparison;
                    }
                    // If names exist, use alphabetical order as second tie breaker
                    return a.name.localeCompare(b.name);
                }
                return segmentComparison;
            } else if (a.speakerSegments && !b.speakerSegments) {
                return -1;
            } else if (!a.speakerSegments && b.speakerSegments) {
                return 1;
            }

            // If no statistics or segments, use agenda item index
            const agendaComparison = compareAgendaIndex();
            if (agendaComparison != null && agendaComparison !== 0) {
                return agendaComparison;
            }

            // Last resort: alphabetical sort by name
            return a.name.localeCompare(b.name);
        } else if (orderBy === 'appearance') {
            // For appearance order, we need a different approach based on data available

            // If we have full speaker segments with timestamps
            if (a.speakerSegments?.length && b.speakerSegments?.length) {
                // Try to extract timestamps if the structure has them
                const hasTimestamps = (segments: MinimalSpeakerSegment[]) => segments.some((s) =>
                    (s.startTimestamp ?? s.speakerSegment?.startTimestamp) != null);

                const aHasTimestamps = hasTimestamps(a.speakerSegments);
                const bHasTimestamps = hasTimestamps(b.speakerSegments);

                if (aHasTimestamps && bHasTimestamps) {
                    try {
                        // Try to extract timestamps from various possible structures
                        const aTimestamps = a.speakerSegments.map(s =>
                            s.startTimestamp ?? s.speakerSegment?.startTimestamp ?? 0);
                        const bTimestamps = b.speakerSegments.map(s =>
                            s.startTimestamp ?? s.speakerSegment?.startTimestamp ?? 0);

                        if (aTimestamps.length && bTimestamps.length) {
                            const timestampComparison = Math.min(...aTimestamps) - Math.min(...bTimestamps);
                            // If timestamps are equal, fall back to agenda item
                            if (timestampComparison === 0) {
                                // If agenda items exist, use them as tie breaker
                                const agendaComparison = compareAgendaIndex();
                                if (agendaComparison != null && agendaComparison !== 0) {
                                    return agendaComparison;
                                }
                                // Last resort: alphabetical sort by name
                                return a.name.localeCompare(b.name);
                            }
                            return timestampComparison;
                        }
                    } catch (error) {
                        // Fallback silently if timestamp extraction fails
                        console.error("Error extracting timestamps:", error);
                    }
                }
            }

            // Fallback to agenda item index for appearance order
            const indexComparison = compareAgendaIndex();
            if (indexComparison != null) {
                // If agenda items are equal, sort alphabetically by name
                if (indexComparison === 0) {
                    return a.name.localeCompare(b.name);
                }
                return indexComparison;
            }

            // Last resort: alphabetical sort by name
            return a.name.localeCompare(b.name);
        }

        // Default fallback - alphabetical order
        return a.name.localeCompare(b.name);
    });
}

export function sortSubjectsBySpeakingTime<T extends SortableSubject>(subjects: T[]): T[] {
    return [...subjects].sort((a, b) => {
        const aSeconds = a.statistics?.speakingSeconds ?? 0;
        const bSeconds = b.statistics?.speakingSeconds ?? 0;
        if (bSeconds !== aSeconds) return bSeconds - aSeconds;
        return a.name.localeCompare(b.name);
    });
}

export function sortSubjectsByAgendaIndex<T extends SortableSubject>(subjects: T[]): T[] {
    return [...subjects].sort((a, b) => {
        const aIndex = a.agendaItemIndex ?? Infinity;
        const bIndex = b.agendaItemIndex ?? Infinity;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return a.name.localeCompare(b.name);
    });
}
