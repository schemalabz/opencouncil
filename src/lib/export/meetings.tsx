"use client";
import { pdf } from '@react-pdf/renderer';
import { CouncilMeetingDocument } from '@/components/meetings/pdf/CouncilMeetingDocument';
import { renderDocx } from '@/components/meetings/docx/CouncilMeetingDocx';
import { MeetingData } from '@/lib/getMeetingData';

export async function exportMeetingToPDF(data: MeetingData): Promise<Blob> {
  const { city, meeting, transcript, people, parties, speakerTags } = data;
  
  const pdfDocument = <CouncilMeetingDocument 
    city={city} 
    meeting={meeting} 
    transcript={transcript} 
    people={people} 
    parties={parties} 
    speakerTags={speakerTags} 
  />;
  
  return await pdf(pdfDocument).toBlob();
}

export async function exportMeetingToDocx(data: MeetingData): Promise<Blob> {
  const { city, meeting, transcript, people, parties, speakerTags } = data;
  
  const doc = await renderDocx({ 
    city, 
    meeting, 
    transcript, 
    people, 
    parties, 
    speakerTags 
  });
  
  return await doc.save();
}

export function generateMeetingFileName(cityId: string, meetingId: string, format: 'pdf' | 'docx'): string {
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

