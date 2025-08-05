"use client";

import { format } from "date-fns";
import { CouncilMeetingWithAdminBodyAndSubjects } from "@/lib/db/meetings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableCell } from "@/components/ui/table";
import { 
    FileText, 
    Calendar,
    Building,
    CheckCircle,
    XCircle,
    AlertCircle,
    FileDown,
    ExternalLink
} from "lucide-react";
import { getMeetingState } from "@/lib/utils";
import { MeetingExportButtons } from "@/components/meetings/MeetingExportButtons";
import { MeetingData } from "@/lib/getMeetingData";
import { ExpandableTableRow } from "@/components/ui/expandable-table-row";
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
    const meetingState = getMeetingState(meeting);
    const subjectCount = meeting.subjects.length;
    const meetingDate = format(new Date(meeting.dateTime), "MMM dd, yyyy");

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

    // Expanded content
    const expandedContent = (
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
                <CardContent>
                    <MeetingExportButtons
                        getMeetingData={fetchCompleteMeetingData}
                        cityId={selectedCityId}
                        meetingId={meeting.id}
                        disabled={meetingState.icon === 'ban'}
                    />
                </CardContent>
            </Card>
        </div>
    );

    return (
        <ExpandableTableRow
            rowId={meeting.id}
            isSelected={isSelected}
            onSelect={onSelect}
            expandedContent={expandedContent}
            ariaLabel={meeting.name}
        >
            {/* Meeting Info */}
            <TableCell className="min-w-0">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-foreground truncate">{meeting.name}</span>
                        {!meeting.released && (
                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                                Draft
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground min-w-0">
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <Calendar className="h-3 w-3" />
                            {meetingDate}
                        </div>
                        {meeting.administrativeBody && (
                            <div className="flex items-center gap-1 min-w-0">
                                <Building className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{meeting.administrativeBody.name}</span>
                            </div>
                        )}
                    </div>
                </div>
            </TableCell>

            {/* Status */}
            <TableCell className="w-32">
                <div className="flex items-center gap-2">
                    {getMeetingStateIcon()}
                    <span className="text-sm whitespace-nowrap">
                        {meetingState.label}
                    </span>
                </div>
            </TableCell>

            {/* Subjects Count */}
            <TableCell className="w-24">
                {subjectCount > 0 ? (
                    <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {subjectCount} subject{subjectCount !== 1 ? 's' : ''}
                    </Badge>
                ) : (
                    <span className="text-sm text-muted-foreground whitespace-nowrap">No subjects</span>
                )}
            </TableCell>
        </ExpandableTableRow>
    );
} 