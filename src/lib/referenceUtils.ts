/*
 * Reference Parsing Utilities
 */

// Reference types
export type ReferenceType = 'utterance' | 'person' | 'party' | 'subject';

export interface ParsedReference {
    type: ReferenceType;
    id: string;
    displayText: string;
}

/**
 * Parse markdown references in contribution text
 * @param markdown - Markdown text with REF:TYPE:ID links
 * @returns Parsed text and reference array
 */
export function parseReferences(markdown: string): {
    text: string;
    references: ParsedReference[];
} {
    const references: ParsedReference[] = [];
    const refRegex = /\[([^\]]+)\]\(REF:(UTTERANCE|PERSON|PARTY|SUBJECT):([^)]+)\)/g;

    let match;
    while ((match = refRegex.exec(markdown)) !== null) {
        references.push({
            type: match[2].toLowerCase() as ReferenceType,
            id: match[3],
            displayText: match[1]
        });
    }

    return { text: markdown, references };
}

/**
 * Extract all utterance IDs from contribution text
 * @param contributionText - Markdown text with REF:UTTERANCE:ID links
 * @returns Array of utterance IDs
 */
export function extractUtteranceIds(contributionText: string): string[] {
    const { references } = parseReferences(contributionText);
    return references
        .filter(ref => ref.type === 'utterance')
        .map(ref => ref.id);
}
