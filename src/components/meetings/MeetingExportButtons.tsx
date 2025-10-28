"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileDown, Loader2, Music } from "lucide-react";
import { exportMeetingToDocx, exportMeetingAudioWithProgress, downloadFile, generateMeetingFileName } from '@/lib/export/meetings';
import { MeetingDataForExport } from "@/lib/export/meetings";
import { useToast } from '@/hooks/use-toast';

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
  const [isExportingAudio, setIsExportingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const { toast } = useToast();

  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    try {
      const meetingData = await getMeetingData();
      const blob = await exportMeetingToDocx(meetingData);
      const fileName = generateMeetingFileName(cityId, meetingId, 'docx');
      downloadFile(blob, fileName);
      toast({
        title: "Εξαγωγή επιτυχής",
        description: "Το έγγραφο DOCX κατέβηκε με επιτυχία.",
      });
    } catch (error) {
      console.error('Error exporting to DOCX:', error);
      toast({
        title: "Σφάλμα εξαγωγής",
        description: "Αδυναμία εξαγωγής του εγγράφου DOCX. Δοκιμάστε ξανά.",
        variant: "destructive"
      });
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleExportAudio = async () => {
    setIsExportingAudio(true);
    setAudioProgress(0);
    try {
      const meetingData = await getMeetingData();
      const blob = await exportMeetingAudioWithProgress(meetingData, (progress) => {
        setAudioProgress(progress);
      });
      const fileName = generateMeetingFileName(cityId, meetingId, 'mp3');
      downloadFile(blob, fileName);
      toast({
        title: "Εξαγωγή επιτυχής",
        description: "Το αρχείο ήχου κατέβηκε με επιτυχία.",
      });
    } catch (error) {
      console.error('Error exporting audio:', error);
      const errorMessage = error instanceof Error ? error.message : 'Άγνωστο σφάλμα';
      toast({
        title: "Σφάλμα εξαγωγής",
        description: `Αδυναμία εξαγωγής του αρχείου ήχου: ${errorMessage}`,
        variant: "destructive"
      });
    } finally {
      setIsExportingAudio(false);
      setAudioProgress(0);
    }
  };

  const isDisabled = disabled || isExportingDocx || isExportingAudio;

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
      
      <div className="w-full sm:w-auto">
        <Button
          onClick={handleExportAudio}
          className="w-full sm:w-auto"
          disabled={isDisabled}
          variant="outline"
        >
          {isExportingAudio ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Music className="w-4 h-4 mr-2" />
          )}
          <span>Εξαγωγή Ήχου</span>
        </Button>
        
        {isExportingAudio && (
          <div className="mt-2 space-y-1">
            <Progress value={audioProgress} className="h-2" />
          </div>
        )}
      </div>
    </div>
  );
} 