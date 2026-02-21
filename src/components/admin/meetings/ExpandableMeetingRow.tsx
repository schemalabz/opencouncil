"use client";

import { format } from "date-fns";
import React from "react";
import { CouncilMeetingWithAdminBodyAndSubjects } from "@/lib/db/meetings";
import { MeetingStage, MeetingStatus } from "@/lib/meetingStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableCell } from "@/components/ui/table";
import {
    FileText,
    Calendar,
    Building,
    FileDown,
    ExternalLink,
    CheckCircle,
    ListChecks,
    Landmark,
    Clock,
    Loader2,
} from "lucide-react";
import { MeetingExportButtons } from "@/components/meetings/MeetingExportButtons";
import { MeetingData } from "@/lib/getMeetingData";
import { ExpandableTableRow } from "@/components/ui/expandable-table-row";
import { MeetingStatusBadge } from "@/components/meetings/MeetingStatusBadge";
import Link from "next/link";
import { MeetingTimeline } from "@/components/meetings/MeetingTimeline";
import { getPollingHistoryForMeeting } from "@/lib/tasks/pollDecisions";

interface ExpandableMeetingRowProps {
    meeting: CouncilMeetingWithAdminBodyAndSubjects;
    selectedCityId: string;
    isSelected: boolean;
    onSelect: (checked: boolean) => void;
    decisionCounts?: { linked: number; eligible: number };
}

export function ExpandableMeetingRow({
    meeting,
    selectedCityId,
    isSelected,
    onSelect,
    decisionCounts,
}: ExpandableMeetingRowProps) {
    const [meetingStage, setMeetingStage] = React.useState<MeetingStage>('scheduled');
    const [meetingStatus, setMeetingStatus] = React.useState<MeetingStatus | null>(null);
    const [pollingStatus, setPollingStatus] = React.useState<Awaited<ReturnType<typeof getPollingHistoryForMeeting>> | null>(null);
    const [pollingLoading, setPollingLoading] = React.useState(false);
    const [pollingFetched, setPollingFetched] = React.useState(false);
    const subjectCount = meeting.subjects.length;
    const meetingDate = format(new Date(meeting.dateTime), "MMM dd, yyyy");

    const fetchCompleteMeetingData = async (): Promise<MeetingData> => {
        const response = await fetch(`/api/cities/${selectedCityId}/meetings/${meeting.id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch meeting data');
        }
        const data = await response.json();
        return data;
    };

    const fetchPollingStatus = React.useCallback(() => {
        if (pollingFetched || pollingLoading) return;
        setPollingLoading(true);
        getPollingHistoryForMeeting(selectedCityId, meeting.id)
            .then(setPollingStatus)
            .catch(() => { /* silent */ })
            .finally(() => {
                setPollingLoading(false);
                setPollingFetched(true);
            });
    }, [selectedCityId, meeting.id, pollingFetched, pollingLoading]);

    // Expanded content
    const expandedContent = (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                    {/* Meeting media state removed; we now rely on processing stage */}
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
                        disabled={false}
                    />
                </CardContent>
            </Card>

            {/* Processing Timeline */}
            {meetingStatus && (
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <ListChecks className="h-4 w-4" />
                            Processing Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <MeetingTimeline meetingStatus={meetingStatus} />
                    </CardContent>
                </Card>
            )}

            {/* Decisions */}
            <Card className="shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Landmark className="h-4 w-4" />
                        Decisions
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <div>
                        <strong>Linked:</strong> {decisionCounts ? `${decisionCounts.linked}/${decisionCounts.eligible}` : '-'}
                    </div>
                    {pollingLoading && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading polling info...
                        </div>
                    )}
                    {pollingStatus && pollingStatus.totalPolls > 0 && (
                        <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Polled {pollingStatus.totalPolls} {pollingStatus.totalPolls === 1 ? 'time' : 'times'}
                            </div>
                            {pollingStatus.currentTierLabel && (
                                <div>{pollingStatus.currentTierLabel}</div>
                            )}
                            {pollingStatus.lastPollAt && (
                                <div>Last: {new Date(pollingStatus.lastPollAt).toLocaleDateString()}</div>
                            )}
                            {pollingStatus.nextPollEligible ? (
                                <div>Next: {new Date(pollingStatus.nextPollEligible).toLocaleDateString()}</div>
                            ) : pollingStatus.currentTierLabel?.startsWith('Stopped') ? (
                                <div>Automatic polling stopped</div>
                            ) : null}
                        </div>
                    )}
                    {pollingFetched && (!pollingStatus || pollingStatus.totalPolls === 0) && (
                        <div className="text-xs text-muted-foreground">No polling history</div>
                    )}
                    <div className="pt-2">
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="w-full"
                        >
                            <Link
                                href={`/${selectedCityId}/${meeting.id}/admin`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2"
                            >
                                <ExternalLink className="h-4 w-4" />
                                Manage Decisions
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );

    React.useEffect(() => {
        let mounted = true;
        const fetchStatus = async () => {
            try {
                const res = await fetch(`/api/cities/${selectedCityId}/meetings/${meeting.id}/status`);
                if (!res.ok) return;
                const data = await res.json();
                if (mounted && data?.stage) {
                    setMeetingStage(data.stage);
                    setMeetingStatus(data);
                }
            } catch {}
        };
        fetchStatus();
        return () => { mounted = false; };
    }, [selectedCityId, meeting.id]);

    return (
        <ExpandableTableRow
            rowId={meeting.id}
            isSelected={isSelected}
            onSelect={onSelect}
            expandedContent={expandedContent}
            onExpand={fetchPollingStatus}
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
            <TableCell className="w-40">
                <div className="flex items-center gap-2">
                    <MeetingStatusBadge stage={meetingStage} />
                </div>
            </TableCell>

            {/* Human Review Status */}
            <TableCell className="w-16 text-center">
                <div className="flex items-center justify-center">
                    <span className="text-lg">
                        {meetingStatus?.tasks.humanReview && (
                            <CheckCircle className="h-3 w-3 text-green-600 ml-1" />
                        )}
                    </span>
                </div>
            </TableCell>

            {/* Transcript Sent Status */}
            <TableCell className="w-16 text-center">
                <div className="flex items-center justify-center">
                    {meetingStatus?.tasks.transcriptSent && (
                        <CheckCircle className="h-3 w-3 text-green-600" />
                    )}
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

            {/* Decisions Count */}
            <TableCell className="w-24">
                {decisionCounts && decisionCounts.eligible > 0 ? (
                    <Badge
                        variant={decisionCounts.linked === decisionCounts.eligible ? "default" : "outline"}
                        className="text-xs whitespace-nowrap"
                    >
                        {decisionCounts.linked}/{decisionCounts.eligible}
                    </Badge>
                ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                )}
            </TableCell>
        </ExpandableTableRow>
    );
} 