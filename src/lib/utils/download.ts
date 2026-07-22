/**
 * Trigger a browser download of a generated Blob (client-side only).
 * Used by the PDF/docx generators (offer letter, brochure, procurement docs).
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
