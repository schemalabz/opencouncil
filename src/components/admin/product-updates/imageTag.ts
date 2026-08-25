export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif'] as const;
export const EMAIL_CONTENT_WIDTH = 600;

/**
 * Build cross-client compatible <img> markup for a product-update email.
 * Outlook desktop ignores max-width, so the width attribute carries the real
 * constraint. It never exceeds the email content width and never upscales a
 * small image. The style shrinks the image on mobile and modern clients.
 */
export function buildImageTag(url: string, naturalWidth: number): string {
    const width = Math.min(Math.round(naturalWidth) || EMAIL_CONTENT_WIDTH, EMAIL_CONTENT_WIDTH);
    // Escape the attribute-unsafe characters. A crafted filename can put a
    // double quote in the upload URL, which would otherwise end the src early.
    const safeUrl = url.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    return `<img src="${safeUrl}" alt="" width="${width}" style="max-width:100%;height:auto;display:block;">`;
}

export type ImageValidation = { ok: true } | { ok: false; error: string };

/** Guard the type and the size, because POST /api/upload validates neither. */
export function validateImageFile(file: { type: string; size: number }): ImageValidation {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
        return { ok: false, error: 'Use a PNG, JPEG, or GIF image.' };
    }
    if (file.size > MAX_IMAGE_BYTES) {
        return { ok: false, error: 'Image must be 5 MB or smaller.' };
    }
    return { ok: true };
}
