import { useState } from 'react';
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useVideo } from "./VideoProvider";
import { PersonBadge } from "@/components/persons/PersonBadge";
import { formatTimestamp } from "@/lib/utils";

export default function Subjects() {
    const { subjects, getSpeakerTag, getPerson, getSpeakerSegmentById } = useCouncilMeetingData();
    const [expandedSubjects, setExpandedSubjects] = useState<string[]>([]);
    const { seekTo } = useVideo();

    const toggleSubject = (subjectId: string) => {
        setExpandedSubjects(prev =>
            prev.includes(subjectId)
                ? prev.filter(id => id !== subjectId)
                : [...prev, subjectId]
        );
    };

    const handleSpeakerClick = (speakerSegmentId: string) => {
        const segment = getSpeakerSegmentById(speakerSegmentId);
        if (segment) {
            seekTo(segment.startTimestamp);
        }
    };

    return (
        <div className="space-y-4">
            {subjects.map(subject => (
                    <Card key={subject.id} className="w-full">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div>
                                <CardTitle className="text-sm font-medium">
                                    {subject.name}
                                </CardTitle>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {subject.description}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleSubject(subject.id)}
                            >
                                {expandedSubjects.includes(subject.id) ? (
                                    <ChevronUp className="h-4 w-4" />
                                ) : (
                                    <ChevronDown className="h-4 w-4" />
                                )}
                            </Button>
                        </CardHeader>
                        {expandedSubjects.includes(subject.id) && (
                            <CardContent>
                                <ul className="space-y-2">
                                    {subject.speakerSegments
                                        .sort((a, b) => {
                                            const aTimestamp = getSpeakerSegmentById(a.speakerSegment.id)?.startTimestamp || 0;
                                            const bTimestamp = getSpeakerSegmentById(b.speakerSegment.id)?.startTimestamp || 0;
                                            return aTimestamp - bTimestamp;
                                        })
                                        .map(segment => {
                                            const speakerTag = getSpeakerTag(segment.speakerSegment.speakerTagId);
                                            const person = speakerTag?.personId ? getPerson(speakerTag.personId) : null;
                                            const segmentTimestamp = getSpeakerSegmentById(segment.speakerSegment.id)?.startTimestamp;
                                            return (
                                                <li key={segment.id} className="text-sm">
                                                    <div onClick={() => handleSpeakerClick(segment.speakerSegment.id)} className="cursor-pointer flex items-center">
                                                        <PersonBadge
                                                            person={person || undefined}
                                                            speakerTag={speakerTag}
                                                        />
                                                        {segmentTimestamp !== undefined && (
                                                            <span className="ml-2 text-xs text-muted-foreground">
                                                                [{formatTimestamp(segmentTimestamp)}]
                                                            </span>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                </ul>
                            </CardContent>
                        )}
                    </Card>
            ))}
        </div>
    );
}
