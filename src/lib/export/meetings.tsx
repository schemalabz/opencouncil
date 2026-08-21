"use client";
import { pdf } from '@react-pdf/renderer';
import { renderDocx } from '@/components/meetings/docx/CouncilMeetingDocx';
import { MeetingData } from '@/lib/getMeetingData';

/** Why an audio export failed, for callers that need to say so in the reader's
 *  language. Anything not covered here is a genuine surprise and surfaces as-is. */
export type AudioExportFailure = 'noAudio' | 'fetchFailed' | 'network' | 'timeout';

export class AudioExportError extends Error {
    constructor(readonly reason: AudioExportFailure, message: string) {
        super(message);
        this.name = 'AudioExportError';
    }
}

export type MeetingDataForExport = Omit<MeetingData, 'parties' | 'highlights' | 'subjects' | 'speakerTags' | 'taskStatus' | 'transcriptHiddenForReview'>;

export async function exportMeetingToDocx(data: MeetingDataForExport): Promise<Blob> {
  const { city, meeting, transcript, people } = data;

  const doc = await renderDocx({
    city,
    meeting,
    transcript,
    people
  });

  return await doc.save();
}

export async function exportMeetingAudioWithProgress(
  data: MeetingDataForExport,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const { meeting } = data;
  
  if (!(meeting as any).audioUrl) {
    throw new AudioExportError('noAudio', 'No audio URL available for this meeting');
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    // Track download progress
    xhr.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentage = Math.round((event.loaded / event.total) * 100);
        onProgress?.(percentage);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject(new AudioExportError('fetchFailed', `Failed to fetch audio: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => {
      reject(new AudioExportError('network', 'Network error while downloading audio'));
    };

    xhr.ontimeout = () => {
      reject(new AudioExportError('timeout', 'Download timeout. Please try again'));
    };

    // Set timeout to 10 minutes for large audio files
    xhr.timeout = 600000;
    xhr.responseType = 'blob';
    xhr.open('GET', (meeting as any).audioUrl);
    xhr.send();
  });
}

export function generateMeetingFileName(cityId: string, meetingId: string, format: 'pdf' | 'docx' | 'mp3'): string {
  return `${cityId}_council_meeting_${meetingId}.${format}`;
}

// Re-exported for callers that already import it from here. New callers should
// import from ./download directly, to stay clear of this module's renderers.
export { downloadFile } from './download';

