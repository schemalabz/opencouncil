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
 * @returns Array of parsed references
 */
export function parseReferences(markdown: string): ParsedReference[] {
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

    return references;
}

/**
 * Replace REF:TYPE:ID markdown links with their display text, for plain-text
 * contexts (e.g. list cards) — `[some text](REF:UTTERANCE:abc)` → `some text`.
 * @param markdown - Markdown text with REF:TYPE:ID links
 * @returns The text with reference links flattened to their display text
 */
export function stripReferences(markdown: string): string {
    return markdown.replace(/\[([^\]]*)\]\(REF:(?:UTTERANCE|PERSON|PARTY|SUBJECT):[^)]+\)/g, '$1');
}

/**
 * Extract all utterance IDs from contribution text
 * @param contributionText - Markdown text with REF:UTTERANCE:ID links
 * @returns Array of utterance IDs
 */
export function extractUtteranceIds(contributionText: string): string[] {
    const references = parseReferences(contributionText);
    return references
        .filter(ref => ref.type === 'utterance')
        .map(ref => ref.id);
}
