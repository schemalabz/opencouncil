import { stripMarkdown } from '@/lib/formatters/markdown';

/**
 * Landing cards only need a short plain-text summary. Keeping full markdown descriptions in the
 * React Server Component payload makes the initial document much larger without improving the
 * first-screen experience.
 */
export const LANDING_DESCRIPTION_PREVIEW_LENGTH = 240;

export function toLandingDescriptionPreview(
    description: string,
    maxLength = LANDING_DESCRIPTION_PREVIEW_LENGTH,
): string {
    const plainText = stripMarkdown(description);
    if (plainText.length <= maxLength) return plainText;
    if (maxLength <= 0) return '';
    if (maxLength === 1) return '…';

    const contentLength = maxLength - 1;
    const candidate = plainText.slice(0, contentLength + 1);
    const wordBoundary = candidate.lastIndexOf(' ');
    // Prefer a whole word, but do not let one unusually long token erase most of the preview.
    const cutAt = wordBoundary >= Math.floor(contentLength * 0.75) ? wordBoundary : contentLength;

    return `${plainText.slice(0, cutAt).trimEnd()}…`;
}

/** Preserve the database wire shape while replacing the one oversized field at serialization. */
export function toLandingSubjectPreview<T extends { description: string }>(subject: T): T {
    return {
        ...subject,
        description: toLandingDescriptionPreview(subject.description),
    };
}
