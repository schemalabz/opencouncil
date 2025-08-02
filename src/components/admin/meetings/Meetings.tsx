"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo, useEffect } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CouncilMeetingWithAdminBodyAndSubjects } from "@/lib/db/meetings";
import { AdministrativeBodyFilter } from "@/components/AdministrativeBodyFilter";
import { ExpandableMeetingRow } from "./ExpandableMeetingRow";
import { BulkExportActions } from "./BulkExportActions";

interface MeetingsProps {
    meetings: CouncilMeetingWithAdminBodyAndSubjects[];
    currentCityName: string;
    selectedCityId: string;
}

export default function Meetings({ meetings, currentCityName, selectedCityId }: MeetingsProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedAdminBodyId, setSelectedAdminBodyId] = useState<string | null>(null);
    const [selectedMeetingIds, setSelectedMeetingIds] = useState<Set<string>>(new Set());

    // Reset selection when city changes
    useEffect(() => {
        setSelectedMeetingIds(new Set());
        setSelectedAdminBodyId(null);
        setSearchQuery("");
    }, [selectedCityId]);

    // Get unique administrative bodies from meetings
    const administrativeBodies = useMemo(() => {
        const bodies = meetings
            .map(meeting => meeting.administrativeBody)
            .filter((body): body is NonNullable<typeof body> => 
                body !== null && body !== undefined
            )
            .filter((body, index, self) => 
                self.findIndex(b => b.id === body.id) === index
            );
        return bodies;
    }, [meetings]);

    // Filter meetings based on search and administrative body
    const filteredMeetings = useMemo(() => {
        let filtered = meetings;

        // Filter by search query
        if (searchQuery) {
            filtered = filtered.filter(meeting =>
                meeting.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                meeting.administrativeBody?.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        // Filter by administrative body
        if (selectedAdminBodyId) {
            filtered = filtered.filter(meeting => 
                meeting.administrativeBody?.id === selectedAdminBodyId
            );
        }

        return filtered;
    }, [meetings, searchQuery, selectedAdminBodyId]);

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

            {/* Administrative Body Filter */}
            {administrativeBodies.length > 0 && (
                <AdministrativeBodyFilter
                    administrativeBodies={administrativeBodies}
                    selectedAdminBodyId={selectedAdminBodyId}
                    onSelectAdminBody={setSelectedAdminBodyId}
                />
            )}

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Meetings</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalMeetings}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Released</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.releasedMeetings}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">With Content</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.meetingsWithContent}</div>
                    </CardContent>
                </Card>
            </div>

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
                        <div className='space-y-2'>
                            {filteredMeetings.map(meeting => (
                                <ExpandableMeetingRow
                                    key={meeting.id}
                                    meeting={meeting}
                                    selectedCityId={selectedCityId}
                                    isSelected={selectedMeetingIds.has(meeting.id)}
                                    onSelect={(checked: boolean) => handleSelectMeeting(meeting.id, checked)}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </>
    );
} 