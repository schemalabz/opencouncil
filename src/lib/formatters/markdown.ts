/**
 * Strips markdown formatting and extracts plain text
 * Removes links, bold, italic, and other markdown syntax
 */
export function stripMarkdown(markdown: string): string {
    if (!markdown) return '';
    return markdown
        // Remove reference links [text](REF:TYPE:ID)
        .replace(/\[([^\]]+)\]\(REF:[^)]+\)/g, '$1')
        // Remove regular links [text](url)
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
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
