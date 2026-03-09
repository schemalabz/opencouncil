/**
 * Try to match a speakerName (which may include a role prefix, e.g.
 * "Αντιδήμαρχος Ευαγγελίδου") to one of the known people.
 *
 * Strategy: tokenize both the speakerName and each person's name, then check
 * if any person has at least one name-token that appears inside the
 * speakerName tokens. To avoid false positives on very short tokens (e.g.
 * single-letter initials) we require the matching token to be at least 3
 * characters. If exactly one person matches, return their id; otherwise
 * return null to avoid ambiguous matches.
 */
export function matchSpeakerNameToPerson(
    speakerName: string,
    people: { id: string; name: string }[]
): string | null {
    const speakerTokens = speakerName.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
    if (speakerTokens.length === 0) return null;

    const matches: string[] = [];

    for (const person of people) {
        const personTokens = person.name.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
        // Check if any person name-token is present in the speaker tokens
        const hasMatch = personTokens.some(pt => speakerTokens.includes(pt));
        if (hasMatch) {
            matches.push(person.id);
        }
    }

    // Only return a match if exactly one person matched (unambiguous)
    return matches.length === 1 ? matches[0] : null;
}
