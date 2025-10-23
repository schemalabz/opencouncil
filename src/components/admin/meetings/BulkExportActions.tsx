"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { CouncilMeetingWithAdminBodyAndSubjects } from "@/lib/db/meetings";
import { FileDown, Loader2, Music } from "lucide-react";
import { 
    exportMeetingToDocx, 
    exportMeetingAudioWithProgress,
    generateMeetingFileName, 
    downloadFile
} from "@/lib/export/meetings";
import { MeetingData } from "@/lib/getMeetingData";
import { useToast } from '@/hooks/use-toast';

interface BulkExportActionsProps {
    selectedMeetingIds: Set<string>;
    meetings: CouncilMeetingWithAdminBodyAndSubjects[];
    selectedCityId: string;
    onSelectAll: (checked: boolean) => void;
    isAllSelected: boolean;
    isPartiallySelected: boolean;
}

export function BulkExportActions({
    selectedMeetingIds,
    meetings,
    selectedCityId,
    onSelectAll,
    isAllSelected,
    isPartiallySelected
}: BulkExportActionsProps) {
    const [isExportingDocx, setIsExportingDocx] = useState(false);
    const [isExportingAudio, setIsExportingAudio] = useState(false);
    const [currentExport, setCurrentExport] = useState<{ current: number; total: number } | null>(null);
    const [audioProgress, setAudioProgress] = useState<{ [meetingId: string]: number }>({});
    const { toast } = useToast();

    const selectedMeetings = meetings.filter(meeting => selectedMeetingIds.has(meeting.id));
    const hasSelectedMeetings = selectedMeetingIds.size > 0;

    const fetchCompleteMeetingData = async (meetingId: string): Promise<MeetingData> => {
        const response = await fetch(`/api/cities/${selectedCityId}/meetings/${meetingId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch meeting data for ${meetingId}`);
        }
        const data = await response.json();
        return data;
    };

    const handleBulkExportDocx = async () => {
        if (selectedMeetings.length === 0) return;

        setIsExportingDocx(true);
        setCurrentExport({ current: 0, total: selectedMeetings.length });
        let successCount = 0;
        let errorCount = 0;

        try {
            for (let i = 0; i < selectedMeetings.length; i++) {
                const meeting = selectedMeetings[i];
                setCurrentExport({ current: i + 1, total: selectedMeetings.length });

                try {
                    // Fetch complete meeting data via API
                    const meetingData = await fetchCompleteMeetingData(meeting.id);

                    const blob = await exportMeetingToDocx(meetingData);
                    
                    const fileName = generateMeetingFileName(selectedCityId, meeting.id, 'docx');
                    downloadFile(blob, fileName);
                    successCount++;

                    // Small delay between downloads to prevent browser throttling
                    if (i < selectedMeetings.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                } catch (error) {
                    console.error(`Error exporting meeting ${meeting.id}:`, error);
                    errorCount++;
                    // Continue with other meetings even if one fails
                }
            }
        } catch (error) {
            console.error('Error during bulk export:', error);
        } finally {
            setIsExportingDocx(false);
            setCurrentExport(null);
            
            // Show summary toast
            if (errorCount === 0) {
                toast({
                    title: "Εξαγωγή επιτυχής",
                    description: `Εξήχθηκαν επιτυχώς ${successCount} έγγραφα DOCX.`,
                });
            } else {
                toast({
                    title: "Εξαγωγή με σφάλματα",
                    description: `Εξήχθηκαν ${successCount} έγγραφα, ${errorCount} απέτυχαν.`,
                    variant: "destructive"
                });
            }
        }
    };

    const handleBulkExportAudio = async () => {
        if (selectedMeetings.length === 0) return;

        setIsExportingAudio(true);
        setCurrentExport({ current: 0, total: selectedMeetings.length });
        setAudioProgress({});
        let successCount = 0;
        let errorCount = 0;

        try {
            for (let i = 0; i < selectedMeetings.length; i++) {
                const meeting = selectedMeetings[i];
                setCurrentExport({ current: i + 1, total: selectedMeetings.length });

                try {
                    // Fetch complete meeting data via API
                    const meetingData = await fetchCompleteMeetingData(meeting.id);

                    const blob = await exportMeetingAudioWithProgress(meetingData, (progress) => {
                        setAudioProgress(prev => ({
                            ...prev,
                            [meeting.id]: progress
                        }));
                    });
                    
                    const fileName = generateMeetingFileName(selectedCityId, meeting.id, 'mp3');
                    downloadFile(blob, fileName);
                    successCount++;

                    // Small delay between downloads to prevent browser throttling
                    if (i < selectedMeetings.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                } catch (error) {
                    console.error(`Error exporting meeting ${meeting.id}:`, error);
                    errorCount++;
                    // Continue with other meetings even if one fails
                }
            }
        } catch (error) {
            console.error('Error during bulk export:', error);
        } finally {
            setIsExportingAudio(false);
            setCurrentExport(null);
            setAudioProgress({});
            
            // Show summary toast
            if (errorCount === 0) {
                toast({
                    title: "Εξαγωγή επιτυχής",
                    description: `Εξήχθηκαν επιτυχώς ${successCount} αρχεία ήχου.`,
                });
            } else {
                toast({
                    title: "Εξαγωγή με σφάλματα",
                    description: `Εξήχθηκαν ${successCount} αρχεία ήχου, ${errorCount} απέτυχαν.`,
                    variant: "destructive"
                });
            }
        }
    };

    const handleSelectAll = (checked: boolean) => {
        onSelectAll(checked);
    };

    return (
        <div className="flex items-center gap-2">
            {/* Select All Checkbox */}
            <div className="flex items-center gap-2">
                <div className="relative flex items-center">
                    <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all meetings"
                    />
                    {/* Visual indicator for indeterminate state */}
                    {isPartiallySelected && !isAllSelected && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                            <div className="w-1.5 h-1.5 rounded-full bg-current" />
                        </div>
                    )}
                </div>
                <span className="text-sm text-muted-foreground hidden sm:inline">
                    {selectedMeetingIds.size > 0 
                        ? `${selectedMeetingIds.size} selected` 
                        : 'Select all'
                    }
                </span>
            </div>

            {/* Bulk Export Buttons */}
            {hasSelectedMeetings && (
                <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                        <Button 
                            variant="outline" 
                            size="sm"
                            disabled={isExportingDocx || isExportingAudio}
                            onClick={handleBulkExportDocx}
                        >
                            {isExportingDocx ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {currentExport && (
                                        <span className="hidden sm:inline">
                                            Exporting {currentExport.current}/{currentExport.total}
                                        </span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <FileDown className="w-4 h-4 mr-2" />
                                    <span className="hidden sm:inline">Export all as DOCX</span>
                                </>
                            )}
                        </Button>
                        
                        <Button 
                            variant="outline" 
                            size="sm"
                            disabled={isExportingDocx || isExportingAudio}
                            onClick={handleBulkExportAudio}
                        >
                            {isExportingAudio ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {currentExport && (
                                        <span className="hidden sm:inline">
                                            Exporting {currentExport.current}/{currentExport.total}
                                        </span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Music className="w-4 h-4 mr-2" />
                                    <span className="hidden sm:inline">Export all Audio</span>
                                </>
                            )}
                        </Button>
                    </div>
                    
                    {/* Progress indicators for audio export */}
                    {isExportingAudio && Object.keys(audioProgress).length > 0 && (
                        <div className="space-y-2 p-2 bg-muted/50 rounded-md">
                            {Object.entries(audioProgress).map(([meetingId, progress]) => {
                                const meeting = selectedMeetings.find(m => m.id === meetingId);
                                return (
                                    <div key={meetingId} className="space-y-1">
                                        <div className="flex justify-between text-xs">
                                            <span className="truncate">
                                                {meeting?.name || `Meeting ${meetingId.slice(0, 8)}`}
                                            </span>
                                            <span>{progress}%</span>
                                        </div>
                                        <Progress value={progress} className="h-1.5" />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
} 