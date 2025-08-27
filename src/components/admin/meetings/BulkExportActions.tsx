"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CouncilMeetingWithAdminBodyAndSubjects } from "@/lib/db/meetings";
import { FileDown, Loader2 } from "lucide-react";
import { 
    exportMeetingToDocx, 
    generateMeetingFileName, 
    downloadFile
} from "@/lib/export/meetings";
import { MeetingData } from "@/lib/getMeetingData";

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
    const [isExporting, setIsExporting] = useState(false);
    const [currentExport, setCurrentExport] = useState<{ current: number; total: number } | null>(null);

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

    const handleBulkExport = async () => {
        if (selectedMeetings.length === 0) return;

        setIsExporting(true);
        setCurrentExport({ current: 0, total: selectedMeetings.length });

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

                    // Small delay between downloads to prevent browser throttling
                    if (i < selectedMeetings.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                } catch (error) {
                    console.error(`Error exporting meeting ${meeting.id}:`, error);
                    // Continue with other meetings even if one fails
                }
            }
        } catch (error) {
            console.error('Error during bulk export:', error);
        } finally {
            setIsExporting(false);
            setCurrentExport(null);
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

            {/* Bulk Export Button */}
            {hasSelectedMeetings && (
                <Button 
                    variant="outline" 
                    size="sm"
                    disabled={isExporting}
                    onClick={handleBulkExport}
                >
                    {isExporting ? (
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
            )}
        </div>
    );
} 