import sanitizeHtml from 'sanitize-html';
import { normalizeNonBreakingSpaces } from './commentText';

/**
 * Sanitize HTML content for safe rendering in consultation comments.
 * Allows basic formatting tags and ensures links open in new tabs.
 */
export function getSafeHtmlContent(html: string): string {
    return sanitizeHtml(html, {
        allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li'],
        allowedAttributes: {
            'a': ['href', 'target', 'rel']
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        transformTags: {
            // Ensure external links open in new tab with security attributes
            'a': (tagName, attribs) => ({
                tagName: 'a',
                attribs: {
                    ...attribs,
                    target: '_blank',
                    rel: 'noopener noreferrer'
                }
            })
        }
    });
}

/** A stored consultation comment as safe HTML to render, with the old editor's spacing repaired. */
export function getSafeCommentHtml(body: string): string {
    return normalizeNonBreakingSpaces(getSafeHtmlContent(body));
}
