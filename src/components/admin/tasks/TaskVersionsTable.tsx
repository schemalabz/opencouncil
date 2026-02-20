'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { MeetingTaskType } from '@/lib/tasks/types';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/formatters/time";

type TaskVersion = number | null;

interface Meeting {
    meetingId: string;
    cityId: string;
    dateTime: string | null;
    [key: string]: any; // For task versions like transcribe, processAgenda, summarize
}

interface City {
    cityId: string;
    cityName: string;
    cityNameEn: string;
    meetings: Meeting[];
    meetingCount: number;
}

interface TaskVersionsTableProps {
    highestVersions: Record<string, TaskVersion>;
    citiesData: Record<string, City>;
    taskTypes: MeetingTaskType[];
}

export default function TaskVersionsTable({
    highestVersions,
    citiesData,
    taskTypes
}: TaskVersionsTableProps) {
    const [expandedCities, setExpandedCities] = useState<Record<string, boolean>>({});

    const toggleCity = (cityId: string) => {
        setExpandedCities(prev => ({
            ...prev,
            [cityId]: !prev[cityId]
        }));
    };

    return (
        <div className="space-y-8">
            {/* Global highest versions table */}
            <Card>
                <CardHeader>
                    <CardTitle>Latest Global Task Versions</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {taskTypes.map(taskType => (
                                    <TableHead key={taskType}>
                                        {taskType}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                {taskTypes.map(taskType => (
                                    <TableCell key={taskType}>
                                        {highestVersions[taskType] !== null
                                            ? <Badge variant="outline">v{highestVersions[taskType]}</Badge>
                                            : <Badge variant="outline" className="text-gray-400">unversioned</Badge>}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Cities and their meetings */}
            <Card>
                <CardHeader>
                    <CardTitle>Task Versions by City</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {Object.values(citiesData).map(city => (
                        <Collapsible
                            key={city.cityId}
                            open={expandedCities[city.cityId]}
                            onOpenChange={() => toggleCity(city.cityId)}
                            className="border rounded-md"
                        >
                            <CollapsibleTrigger className="flex justify-between items-center w-full p-4 hover:bg-gray-50">
                                <div className="flex items-center">
                                    {expandedCities[city.cityId]
                                        ? <ChevronDown className="h-5 w-5 text-gray-500 mr-2" />
                                        : <ChevronRight className="h-5 w-5 text-gray-500 mr-2" />}
                                    <span className="text-lg font-medium">
                                        {city.cityName} ({city.cityNameEn})
                                    </span>
                                </div>
                                <Badge variant="secondary">
                                    {city.meetingCount} {city.meetingCount === 1 ? 'meeting' : 'meetings'}
                                </Badge>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="p-4 pt-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Meeting ID</TableHead>
                                            <TableHead>Date</TableHead>
                                            {taskTypes.map(taskType => (
                                                <TableHead key={taskType}>{taskType}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {city.meetings.map(meeting => (
                                            <TableRow key={meeting.meetingId}>
                                                <TableCell className="font-mono text-xs">
                                                    {meeting.meetingId}
                                                </TableCell>
                                                <TableCell className="text-sm whitespace-nowrap">
                                                    {meeting.dateTime
                                                        ? formatDate(new Date(meeting.dateTime))
                                                        : "—"}
                                                </TableCell>
                                                {taskTypes.map(taskType => (
                                                    <TableCell key={taskType}>
                                                        {meeting[taskType] !== null
                                                            ? <Badge variant="outline">v{meeting[taskType]}</Badge>
                                                            : <Badge variant="outline" className="text-gray-400">unversioned</Badge>}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CollapsibleContent>
                        </Collapsible>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
} 