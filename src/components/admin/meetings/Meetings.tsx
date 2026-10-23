"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CouncilMeetingWithAdminBodyAndSubjects } from "@/lib/db/meetings";
import { MeetingDecisionCounts } from "@/lib/db/decisions";
import type { MeetingDocumentChips } from "@/lib/documents/status";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgePicker, BadgePickerOption } from "@/components/ui/badge-picker";
import { ExpandableMeetingRow } from "./ExpandableMeetingRow";
import { BulkExportActions } from "./BulkExportActions";
import { BulkPollDecisionsAction } from "./BulkPollDecisionsAction";
import { StatsCard, StatsCardItem } from "@/components/ui/stats-card";
import { meetingLabel } from '@/lib/meetingName';
import { DEFAULT_TIMEZONE } from '@/lib/formatters/time';

interface MeetingsProps {
    meetings: CouncilMeetingWithAdminBodyAndSubjects[];
    currentCityName: string;
    selectedCityId: string;
    decisionCounts: MeetingDecisionCounts;
    documentChips: MeetingDocumentChips;
    cityHasDiavgeiaUid: boolean;
}

export default function Meetings({ meetings, currentCityName, selectedCityId, decisionCounts, documentChips, cityHasDiavgeiaUid }: MeetingsProps) {
    const tCommon = useTranslations('Common');
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedAdminBodyId, setSelectedAdminBodyId] = useState<string | null>(null);
    const [selectedMeetingIds, setSelectedMeetingIds] = useState<Set<string>>(new Set());
    const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);

    // Reset selection when city changes
    useEffect(() => {
        setSelectedMeetingIds(new Set());
        setSelectedAdminBodyId(null);
        setSearchQuery("");
        setNeedsAttentionOnly(false);
    }, [selectedCityId]);

    // A document that needs an operator: failed, sent incomplete, due and not sent, or reviewed with no agenda
    const needsAttention = (meetingId: string) => (documentChips[meetingId] ?? []).some(chip => chip.attention);
    const attentionCount = useMemo(() => meetings.filter(meeting => needsAttention(meeting.id)).length, [meetings, documentChips]); // eslint-disable-line react-hooks/exhaustive-deps

    // Get unique administrative bodies from meetings as BadgePicker options
    const adminBodyOptions = useMemo(() => {
        const bodies = meetings
            .map(meeting => meeting.administrativeBody)
            .filter((body): body is NonNullable<typeof body> =>
                body !== null && body !== undefined
            )
            .filter((body, index, self) =>
                self.findIndex(b => b.id === body.id) === index
            );
        return bodies.map(body => ({
            value: body.id,
            label: body.name
        } satisfies BadgePickerOption<string>));
    }, [meetings]);

    // Filter meetings based on search and administrative body
    const filteredMeetings = useMemo(() => {
        let filtered = meetings;

        // Filter by search query
        if (searchQuery) {
            filtered = filtered.filter(meeting =>
                meetingLabel(meeting, 'el', DEFAULT_TIMEZONE).toLowerCase().includes(searchQuery.toLowerCase()) ||
                meeting.administrativeBody?.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        // Filter by administrative body
        if (selectedAdminBodyId) {
            filtered = filtered.filter(meeting => 
                meeting.administrativeBody?.id === selectedAdminBodyId
            );
        }

        if (needsAttentionOnly) {
            filtered = filtered.filter(meeting => needsAttention(meeting.id));
        }

        return filtered;
    }, [meetings, searchQuery, selectedAdminBodyId, needsAttentionOnly, documentChips]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedMeetingIds(new Set(filteredMeetings.map(m => m.id)));
        } else {
            setSelectedMeetingIds(new Set());
        }
    };

    const handleSelectMeeting = (meetingId: string, checked: boolean) => {
        const newSelection = new Set(selectedMeetingIds);
        if (checked) {
            newSelection.add(meetingId);
        } else {
            newSelection.delete(meetingId);
        }
        setSelectedMeetingIds(newSelection);
    };

    const stats = useMemo(
        () => ({
            totalMeetings: filteredMeetings.length,
            releasedMeetings: filteredMeetings.filter(meeting => meeting.released).length,
            meetingsWithContent: filteredMeetings.filter(meeting => 
                meeting.audioUrl || meeting.videoUrl || meeting.youtubeUrl
            ).length,
        }),
        [filteredMeetings],
    );

    const statsItems: StatsCardItem[] = useMemo(() => [
        {
            title: "Total Meetings",
            value: stats.totalMeetings,
            description: "Total count of meetings",
        },
        {
            title: "Released",
            value: stats.releasedMeetings,
            description: "Meetings that have been released",
        },
        {
            title: "With Content",
            value: stats.meetingsWithContent,
            description: "Meetings with audio, video, or YouTube content",
        },
    ], [stats]);

    return (
        <>
            <div className='relative flex-1 mb-6'>
                <Search className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                    placeholder="Search meetings..."
                    className='pl-8'
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Filters: the body chips, and the documents that need an operator */}
            <div className="my-4 flex flex-wrap items-start gap-x-4 gap-y-2">
                {adminBodyOptions.length > 1 && (
                    <BadgePicker
                        options={adminBodyOptions}
                        selectedValues={selectedAdminBodyId ? [selectedAdminBodyId] : []}
                        onSelectionChange={(values) => setSelectedAdminBodyId(values.length > 0 ? values[0] : null)}
                        allLabel={tCommon('allBodies')}
                        collapsible={false}
                    />
                )}
                {/* The same chip shape as the body picker (h-7 rounded-full), so it reads as one more filter */}
                <Button
                    type="button"
                    variant={needsAttentionOnly ? "default" : "ghost"}
                    size="sm"
                    className="h-7 rounded-full px-2.5 text-xs"
                    onClick={() => setNeedsAttentionOnly(value => !value)}
                    disabled={attentionCount === 0 && !needsAttentionOnly}
                    aria-pressed={needsAttentionOnly}
                >
                    <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                    Needs attention
                    <span className={cn("ml-1.5 tabular-nums", needsAttentionOnly ? "text-primary-foreground/80" : "text-muted-foreground")}>{attentionCount}</span>
                </Button>
            </div>

            {/* Statistics Cards */}
            <StatsCard items={statsItems} columns={3} />

            <Card>
                <CardHeader>
                    <CardTitle className='flex justify-between items-center'>
                        <span>Meetings</span>
                        <div className='flex items-center gap-4'>
                            <BulkExportActions
                                selectedMeetingIds={selectedMeetingIds}
                                meetings={filteredMeetings}
                                selectedCityId={selectedCityId}
                                onSelectAll={handleSelectAll}
                                isAllSelected={selectedMeetingIds.size === filteredMeetings.length && filteredMeetings.length > 0}
                                isPartiallySelected={selectedMeetingIds.size > 0 && selectedMeetingIds.size < filteredMeetings.length}
                            />
                            <BulkPollDecisionsAction
                                selectedMeetingIds={selectedMeetingIds}
                                meetings={filteredMeetings}
                                decisionCounts={decisionCounts}
                                selectedCityId={selectedCityId}
                                cityHasDiavgeiaUid={cityHasDiavgeiaUid}
                            />
                            <span className='text-muted-foreground text-sm'>{currentCityName}</span>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredMeetings.length === 0 ? (
                        <div className='text-center py-8 text-muted-foreground'>
                            {meetings.length === 0 ? 'No meetings found for this city' : 'No meetings match your search criteria'}
                        </div>
                    ) : (
                        <Table className="table-fixed">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-12"></TableHead>
                                    <TableHead className="w-12"></TableHead>
                                    <TableHead>Meeting</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-16 text-center">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className="cursor-help">👨‍💻</span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p className="max-w-xs">
                                                        Human Review Status - Shows whether the meeting transcript has been manually reviewed and corrected by a human.
                                                        Green checkmark indicates human review is complete.
                                                    </p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </TableHead>
                                    <TableHead className="w-56">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className="cursor-help">Documents</span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p className="max-w-xs">
                                                        The documents the body sends to the municipality (transcript, minutes): sent, sent incomplete with the missing count, waiting, failed, or not sent. Hover a chip for the recipients, the time and the trigger.
                                                    </p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </TableHead>
                                    <TableHead>Subjects</TableHead>
                                    <TableHead>Decisions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredMeetings.map(meeting => (
                                    <ExpandableMeetingRow
                                        key={meeting.id}
                                        meeting={meeting}
                                        selectedCityId={selectedCityId}
                                        isSelected={selectedMeetingIds.has(meeting.id)}
                                        onSelect={(checked: boolean) => handleSelectMeeting(meeting.id, checked)}
                                        decisionCounts={decisionCounts[meeting.id]}
                                        documentChips={documentChips[meeting.id] ?? []}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </>
    );
} 