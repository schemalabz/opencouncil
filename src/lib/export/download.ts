/**
 * Saves a blob to the user's disk. Kept apart from ./meetings so that a
 * component which only needs to save a file does not pull the PDF and DOCX
 * renderers that module imports at the top level into its bundle.
 */
export function downloadFile(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

/** Name of a highlight's saved video file, without the extension. */
export function generateHighlightFileName(cityId: string, meetingId: string, name: string | null): string {
  return `${cityId}_${meetingId}_${name || 'highlight'}`;
}
