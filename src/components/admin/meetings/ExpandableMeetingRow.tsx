"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CouncilMeetingWithAdminBodyAndSubjects } from "@/lib/db/meetings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { 
    ChevronRight, 
    ChevronDown, 
    FileText, 
    Calendar,
    Clock,
    Building,
    CheckCircle,
    XCircle,
    AlertCircle,
    FileDown,
    Loader2,
    ExternalLink
} from "lucide-react";
import { getMeetingState } from "@/lib/utils";
import { exportMeetingToPDF, exportMeetingToDocx, generateMeetingFileName, downloadFile } from "@/lib/export/meetings";
import { MeetingData } from "@/lib/getMeetingData";
import Link from "next/link";

interface ExpandableMeetingRowProps {
    meeting: CouncilMeetingWithAdminBodyAndSubjects;
    selectedCityId: string;
    isSelected: boolean;
    onSelect: (checked: boolean) => void;
}

export function ExpandableMeetingRow({ 
    meeting, 
    selectedCityId,
    isSelected,
    onSelect
}: ExpandableMeetingRowProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isExportingPDF, setIsExportingPDF] = useState(false);
    const [isExportingDocx, setIsExportingDocx] = useState(false);

    const meetingState = getMeetingState(meeting);
    const subjectCount = meeting.subjects.length;
    const meetingDate = format(new Date(meeting.dateTime), "MMM dd, yyyy");

    const toggleExpanded = () => setIsExpanded(!isExpanded);

    const getMeetingStateIcon = () => {
        switch (meetingState.icon) {
            case 'video':
                return <CheckCircle className="h-4 w-4 text-green-600" />;
            case 'audio':
                return <CheckCircle className="h-4 w-4 text-green-600" />;
            case 'fileText':
                return <AlertCircle className="h-4 w-4 text-yellow-600" />;
            case 'ban':
            default:
                return <XCircle className="h-4 w-4 text-red-600" />;
        }
    };

    const fetchCompleteMeetingData = async (): Promise<MeetingData> => {
        const response = await fetch(`/api/cities/${selectedCityId}/meetings/${meeting.id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch meeting data');
        }
        const data = await response.json();
        return data;
    };

    const handleExportPDF = async () => {
        setIsExportingPDF(true);
        try {
            const meetingData = await fetchCompleteMeetingData();
            const blob = await exportMeetingToPDF(meetingData);
            const fileName = generateMeetingFileName(selectedCityId, meeting.id, 'pdf');
            downloadFile(blob, fileName);
        } catch (error) {
            console.error('Error exporting to PDF:', error);
            // Could add toast notification here
        } finally {
            setIsExportingPDF(false);
        }
    };

    const handleExportDocx = async () => {
        setIsExportingDocx(true);
        try {
            const meetingData = await fetchCompleteMeetingData();
            const blob = await exportMeetingToDocx(meetingData);
            const fileName = generateMeetingFileName(selectedCityId, meeting.id, 'docx');
            downloadFile(blob, fileName);
        } catch (error) {
            console.error('Error exporting to DOCX:', error);
            // Could add toast notification here
        } finally {
            setIsExportingDocx(false);
        }
    };

    // Main row content
    const renderMainRow = () => (
        <div className="flex items-center gap-4 p-4 border-b last:border-b-0">
            {/* Selection Checkbox - Outside the interactive area */}
            <Checkbox
                checked={isSelected}
                onCheckedChange={onSelect}
                aria-label={`Select ${meeting.name}`}
            />

            {/* Main interactive button for expand/collapse */}
            <Button
                variant="ghost"
                className="flex-1 h-auto p-0 justify-start hover:bg-muted/50"
                onClick={toggleExpanded}
                aria-expanded={isExpanded}
                aria-label={`${meeting.name} - ${isExpanded ? 'Collapse' : 'Expand'} details`}
            >
                <div className="flex items-center gap-4 w-full">
                    {/* Expander Icon */}
                    <div className="flex items-center justify-center h-8 w-8">
                        {isExpanded ? (
                            <ChevronDown className="h-4 w-4 transition-transform" />
                        ) : (
                            <ChevronRight className="h-4 w-4 transition-transform" />
                        )}
                    </div>

                    {/* Meeting Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <h3 className="font-medium text-foreground truncate">{meeting.name}</h3>
                                {!meeting.released && (
                                    <Badge variant="secondary" className="text-xs">
                                        Draft
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {meetingDate}
                                </div>
                                {meeting.administrativeBody && (
                                    <div className="flex items-center gap-1">
                                        <Building className="h-3 w-3" />
                                        {meeting.administrativeBody.name}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Status Indicators */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 text-sm">
                            {getMeetingStateIcon()}
                            <span className="hidden sm:inline">{meetingState.label}</span>
                        </div>
                        {subjectCount > 0 && (
                            <Badge variant="outline" className="text-xs">
                                {subjectCount} subject{subjectCount !== 1 ? 's' : ''}
                            </Badge>
                        )}
                    </div>
                </div>
            </Button>
        </div>
    );

    // Expanded content sections
    const renderExpandedContent = () => (
        <div className="bg-muted/30 p-4 border-b">
            <div className="grid gap-4 md:grid-cols-2">
                {/* Meeting Details */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Meeting Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div>
                            <strong>Date & Time:</strong> {format(new Date(meeting.dateTime), "PPpp")}
                        </div>
                        <div>
                            <strong>Status:</strong> {meeting.released ? 'Published' : 'Draft'}
                        </div>
                        {meeting.administrativeBody && (
                            <div>
                                <strong>Administrative Body:</strong> {meeting.administrativeBody.name}
                            </div>
                        )}
                        <div>
                            <strong>Subjects:</strong> {subjectCount}
                        </div>
                        <div className="flex items-center gap-2">
                            <strong>Meeting State:</strong> 
                            {getMeetingStateIcon()}
                            <span>{meetingState.label}</span>
                        </div>
                        <div className="pt-2">
                            <Button 
                                asChild 
                                variant="outline" 
                                size="sm"
                                className="w-full"
                            >
                                <Link 
                                    href={`/${selectedCityId}/${meeting.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    View Meeting Page
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Export Actions */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <FileDown className="h-4 w-4" />
                            Export Options
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="space-y-2">
                            <Button 
                                onClick={handleExportPDF} 
                                className="w-full" 
                                size="sm"
                                disabled={isExportingPDF || meetingState.icon === 'ban'}
                            >
                                {isExportingPDF ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <FileDown className="w-4 h-4 mr-2" />
                                )}
                                Export PDF
                            </Button>
                            
                            <Button 
                                onClick={handleExportDocx} 
                                className="w-full" 
                                size="sm"
                                variant="outline"
                                disabled={isExportingDocx || meetingState.icon === 'ban'}
                            >
                                {isExportingDocx ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <FileDown className="w-4 h-4 mr-2" />
                                )}
                                Export DOCX
                            </Button>
                        </div>
                        
                        {meetingState.icon === 'ban' && (
                            <p className="text-xs text-muted-foreground">
                                No content available for export
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );

    return (
        <>
            {renderMainRow()}
            {isExpanded && renderExpandedContent()}
        </>
    );
} 