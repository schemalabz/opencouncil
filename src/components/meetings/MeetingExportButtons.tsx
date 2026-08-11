"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileDown, Loader2, Music } from "lucide-react";
import { AudioExportError, exportMeetingToDocx, exportMeetingAudioWithProgress, downloadFile, generateMeetingFileName } from '@/lib/export/meetings';
import { MeetingDataForExport } from "@/lib/export/meetings";
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('admin.adminActions.export');

  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    try {
      const meetingData = await getMeetingData();
      const blob = await exportMeetingToDocx(meetingData);
      const fileName = generateMeetingFileName(cityId, meetingId, 'docx');
      downloadFile(blob, fileName);
      toast({
        title: t('successTitle'),
        description: t('docxSuccess'),
      });
    } catch (error) {
      console.error('Error exporting to DOCX:', error);
      toast({
        title: t('errorTitle'),
        description: t('docxError'),
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
        title: t('successTitle'),
        description: t('audioSuccess'),
      });
    } catch (error) {
      console.error('Error exporting audio:', error);
      // Expected failures name themselves; anything else is a bug rather than
      // something to tell the reader about, so it stays in the console above.
      const errorMessage =
        error instanceof AudioExportError ? t(`audioFailure.${error.reason}`) : t('unknownError');
      toast({
        title: t('errorTitle'),
        description: t('audioError', { error: errorMessage }),
        variant: "destructive"
      });
    } finally {
      setIsExportingAudio(false);
      setAudioProgress(0);
    }
  };

  const isDisabled = disabled || isExportingDocx || isExportingAudio;

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleExportDocx}
        className="w-full"
        disabled={isDisabled}
      >
        {isExportingDocx ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <FileDown className="w-4 h-4 mr-2" />
        )}
        <span>{t('docx')}</span>
      </Button>
      
      <div className="w-full">
        <Button
          onClick={handleExportAudio}
          className="w-full"
          disabled={isDisabled}
          variant="outline"
        >
          {isExportingAudio ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Music className="w-4 h-4 mr-2" />
          )}
          <span>{t('audio')}</span>
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