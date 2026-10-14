/**
 * Saves a blob to the user's disk. Kept apart from ./meetings so that a
 * component which only needs to save a file does not pull that module's audio
 * export into its bundle.
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

/** A file a route refused to serve, with the route's HTTP status. */
export class DownloadError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = 'DownloadError';
  }
}

/** Fetches a file a route serves and saves it to the user's disk. Throws a DownloadError when the route fails. */
export async function downloadFromUrl(url: string, fileName: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new DownloadError(response.status);
  downloadFile(await response.blob(), fileName);
}

/**
 * Saves a meeting's transcript .docx. The server builds it, so it is the same
 * document the municipality receives (sendTranscriptToMunicipality). A 404
 * DownloadError means the meeting has no transcript yet.
 */
export function downloadTranscriptDocx(cityId: string, meetingId: string): Promise<void> {
  return downloadFromUrl(`/api/cities/${cityId}/meetings/${meetingId}/transcript`, generateMeetingFileName(cityId, meetingId, 'docx'));
}

/**
 * Name of a meeting's exported file; the transcript email attaches the .docx
 * under it too. Only letters, digits, `_` and `-` of the ids are kept, as the
 * minutes route does: the name goes into a Content-Disposition header, which
 * takes no characters outside Latin-1.
 */
export function generateMeetingFileName(cityId: string, meetingId: string, format: 'pdf' | 'docx' | 'mp3'): string {
  const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${safe(cityId)}_council_meeting_${safe(meetingId)}.${format}`;
}

/** Name of a highlight's saved video file, without the extension. */
export function generateHighlightFileName(cityId: string, meetingId: string, name: string | null): string {
  return `${cityId}_${meetingId}_${name || 'highlight'}`;
}
