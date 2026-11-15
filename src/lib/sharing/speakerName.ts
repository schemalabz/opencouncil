/**
 * The speaker as shared text names it. A name that the AI chose before the
 * human review carries the unverified label, because shared text leaves the
 * site without the page around it (issue #982).
 */
export function sharedSpeakerName(
    name: string | null,
    unverified: boolean,
    labels: { unknownSpeaker: string; unverified: string },
): string {
    if (!name) return labels.unknownSpeaker;
    return unverified ? `${name} (${labels.unverified})` : name;
}
