import type { EventRow } from '@/lib/derivation/types';
import type { MinutesAttendanceChange } from '@/lib/minutes/types';

/**
 * The key that joins a change the minutes print to the stored event behind it:
 * the person, the kind and the sentence. `MinutesAttendanceChange` carries all
 * three straight from the same `EventRow`, but drops the counts. The kind is
 * part of the key: a combined per-vote absence gives a departure and an arrival
 * with one sentence.
 */
export function changeKey(change: Pick<MinutesAttendanceChange, 'personId' | 'type'> & { rawText: string }): string {
    return `${change.personId}|${change.type}|${change.rawText}`;
}

/** How many of the meeting's documents stated each change, by `changeKey`. */
export function documentCountsByChange(events: readonly EventRow[]): Map<string, { reportingDocuments: number; totalDocuments: number }> {
    return new Map(events.map(e => [
        changeKey({ personId: e.personId, type: e.kind === 'ARRIVAL' ? 'arrival' : 'departure', rawText: e.rawText }),
        { reportingDocuments: e.reportingDocuments, totalDocuments: e.totalDocuments },
    ]));
}
