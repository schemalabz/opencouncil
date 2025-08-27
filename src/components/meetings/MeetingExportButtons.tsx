"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { exportMeetingToDocx, downloadFile, generateMeetingFileName } from '@/lib/export/meetings';
import { MeetingDataForExport } from "@/lib/export/meetings";

interface MeetingExportButtonsProps {
  /** Function to get the meeting data for export */
  getMeetingData: () => Promise<MeetingDataForExport> | MeetingDataForExport;
  /** City ID for filename generation */
  cityId: string;
  /** Meeting ID for filename generation */
  meetingId: string;
  /** Additional condition to disable export buttons */
  disabled?: boolean;
}

export function MeetingExportButtons({
  getMeetingData,
  cityId,
  meetingId,
  disabled = false
}: MeetingExportButtonsProps) {
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    try {
      const meetingData = await getMeetingData();
      const blob = await exportMeetingToDocx(meetingData);
      const fileName = generateMeetingFileName(cityId, meetingId, 'docx');
      downloadFile(blob, fileName);
    } catch (error) {
      console.error('Error exporting to DOCX:', error);
    } finally {
      setIsExportingDocx(false);
    }
  };

  const isDisabled = disabled || isExportingDocx;

  return (
    <div className="space-y-2 sm:space-y-0 sm:space-x-2 sm:flex">
      <Button
        onClick={handleExportDocx}
        className="w-full sm:w-auto"
        disabled={isDisabled}
      >
        {isExportingDocx ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <FileDown className="w-4 h-4 mr-2" />
        )}
        <span>Εξαγωγή σε DOCX</span>
      </Button>
    </div>
  );
} 