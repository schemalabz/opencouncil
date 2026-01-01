"use client";
import { pdf } from '@react-pdf/renderer';
import { renderDocx } from '@/components/meetings/docx/CouncilMeetingDocx';
import { MeetingData } from '@/lib/getMeetingData';

export type MeetingDataForExport = Omit<MeetingData, 'parties' | 'highlights' | 'subjects' | 'speakerTags' | 'taskStatus'>;

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
    throw new Error('No audio URL available for this meeting');
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
        reject(new Error(`Failed to fetch audio: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error while downloading audio'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Download timeout. Please try again'));
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

