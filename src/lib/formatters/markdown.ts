/**
 * Strips markdown formatting and extracts plain text
 * Removes links, bold, italic, and other markdown syntax
 */
export function stripMarkdown(markdown: string): string {
    if (!markdown) return '';
    return markdown
        // Remove reference links [text](REF:TYPE:ID)
        .replace(/\[([^\]]+)\]\(REF:[^)]+\)/g, '$1')
        // Remove regular links [text](url); the destination may contain one
        // nesting level of balanced parentheses (e.g. Wikipedia URLs)
        .replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
        // Remove bold **text** or __text__
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        // Remove italic *text* or _text_
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // Remove inline code `text`
        .replace(/`([^`]+)`/g, '$1')
        // Remove headings
        .replace(/^#+\s+/gm, '')
        // Remove list markers
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        // Clean up extra whitespace
        .replace(/\s+/g, ' ')
        .trim();
}

/** How much of a subject's description the landing map ships per row: enough for the card's
 *  clamped excerpt (about five lines of text). The rest comes with the full description on selection. */
export const DESCRIPTION_PREVIEW_CHARS = 240;

/**
 * A markdown description as the plain-text preview a card shows: the markdown stripped and,
 * past `maxChars`, cut at a word boundary with an ellipsis. `descriptionTruncated` says whether
 * there is more to fetch (see GET /api/subject/{id}/description).
 */
export function previewDescription(
    markdown: string,
    maxChars = DESCRIPTION_PREVIEW_CHARS,
): { descriptionPreview: string; descriptionTruncated: boolean } {
    const text = stripMarkdown(markdown);
    // Code points, not UTF-16 units: a cut inside a surrogate pair would leave half an emoji.
    const chars = Array.from(text);
    if (chars.length <= maxChars) return { descriptionPreview: text, descriptionTruncated: false };
    const cut = chars.slice(0, maxChars).join('');
    // The last word boundary inside the cut — its end, when the word there ends exactly at it.
    const space = chars[maxChars] === ' ' ? cut.length : cut.lastIndexOf(' ');
    // Back off to that boundary, unless that would drop most of the preview.
    const head = (space > maxChars * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:·–-]+$/u, '');
    return { descriptionPreview: `${head}…`, descriptionTruncated: true };
}
