/**
 * Which subject a passage of the transcript belongs to.
 *
 * The summarize task assigns a subject to each utterance inside a subject's
 * discussion and leaves the rest unassigned: the roll call, procedure, an
 * aside. The share dialog, which sees the whole transcript in the browser,
 * and the public excerpt resolver, which asks the database, apply the same
 * rules, so the preview names the subject the shared image will show.
 */

/**
 * How far, in seconds, a passage looks for an assigned utterance to borrow a
 * subject from. An aside inside a discussion sits seconds from it; the
 * opening of a meeting sits minutes before its first subject.
 */
export const NEAREST_SUBJECT_WINDOW_S = 120;

/** The subject most of the utterances carry; null when none carries one. */
export function majoritySubject<T extends { id: string }>(subjects: (T | null | undefined)[]): T | null {
    const counts = new Map<string, { subject: T; count: number }>();
    for (const subject of subjects) {
        if (!subject) continue;
        const entry = counts.get(subject.id) ?? { subject, count: 0 };
        entry.count += 1;
        counts.set(subject.id, entry);
    }
    let best: { subject: T; count: number } | null = null;
    for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
    return best?.subject ?? null;
}

/** An assigned utterance next to the passage: when it was said, and what it was about. */
export interface Neighbour<T> { at: number; subject: T }

/** Of the assigned utterances just before and after a passage, the closer one within the window. */
export function nearestSubject<T>(passage: { start: number; end: number }, before: Neighbour<T> | null | undefined, after: Neighbour<T> | null | undefined): T | null {
    const candidates: { subject: T; distance: number }[] = [];
    if (before) candidates.push({ subject: before.subject, distance: passage.start - before.at });
    if (after) candidates.push({ subject: after.subject, distance: after.at - passage.end });
    const nearest = candidates.filter(candidate => candidate.distance <= NEAREST_SUBJECT_WINDOW_S).sort((a, b) => a.distance - b.distance)[0];
    return nearest?.subject ?? null;
}
