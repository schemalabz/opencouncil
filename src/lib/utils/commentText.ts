const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * A reader's plain-text comment as the HTML the comment views render: escaped, a blank line
 * starts a paragraph, a single line break stays a line break. Returns '' for blank input.
 */
export function plainTextToCommentHtml(text: string): string {
    const paragraphs = text
        .replace(/\r\n?/g, '\n')
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.split('\n').map((line) => line.trim()).filter(Boolean))
        .filter((lines) => lines.length > 0);
    return paragraphs.map((lines) => `<p>${lines.map(escapeHtml).join('<br>')}</p>`).join('');
}

/**
 * Comments written in the old rich-text editor put a non-breaking space between every word, so a
 * line never wrapped. This turns them into normal spaces.
 */
export function normalizeNonBreakingSpaces(html: string): string {
    return html.replace(/&nbsp;|\u00a0/g, ' ');
}

const HTML_UNESCAPES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

/** The plain text of a comment stored by plainTextToCommentHtml, for a plain-text quote (an email). */
export function commentHtmlToPlainText(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p>/gi, '\n\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&(amp|lt|gt|quot|#39);/g, (_, entity: string) => HTML_UNESCAPES[entity])
        .trim();
}
