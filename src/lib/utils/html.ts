const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text as it is safe to place in HTML content or in a quoted attribute. */
export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
