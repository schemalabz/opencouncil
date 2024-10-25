import { useState, useEffect } from 'react';
import { SubjectWithRelations } from "@/lib/db/subject";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import SpeakerBadge from "@/components/SpeakerBadge";
import { useVideo } from "./VideoProvider";
import { useTranscriptOptions } from "./options/OptionsContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { requestGeneratePodcastSpec } from '@/lib/tasks/generatePodcastSpec';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

type AllocationOption = 'onlyMention' | 'skip' | 1 | 2 | 3 | 5;

export default function Subjects() {
    const { subjects, getSpeakerTag, getPerson, getParty, transcript } = useCouncilMeetingData();
    const [expandedSubjects, setExpandedSubjects] = useState<string[]>([]);
    const { seekTo } = useVideo();
    const { options } = useTranscriptOptions();
    const [subjectAllocations, setSubjectAllocations] = useState<Record<string, AllocationOption>>({});
    const [isGeneratingPodcastSpec, setIsGeneratingPodcastSpec] = useState(false);
    const [additionalInstructions, setAdditionalInstructions] = useState('');
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const { toast } = useToast();
    const { meeting } = useCouncilMeetingData();
    useEffect(() => {
        const initialAllocations: Record<string, AllocationOption> = {};
        subjects.forEach((subject, index) => {
            if (index === 0) initialAllocations[subject.id] = 3;
            else if (index === 1) initialAllocations[subject.id] = 2;
            else if (index === 2) initialAllocations[subject.id] = 1;
            else if (index < 8) initialAllocations[subject.id] = 'onlyMention';
            else initialAllocations[subject.id] = 'skip';
        });
        setSubjectAllocations(initialAllocations);
    }, [subjects]);

    const toggleSubject = (subjectId: string) => {
        setExpandedSubjects(prev =>
            prev.includes(subjectId)
                ? prev.filter(id => id !== subjectId)
                : [...prev, subjectId]
        );
    };

    const handleSpeakerClick = (speakerSegmentId: string) => {
        const segment = transcript.find(s => s.id === speakerSegmentId);
        if (segment) {
            seekTo(segment.startTimestamp);
        }
    };

    const formatTimestamp = (timestamp: number) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor((timestamp % 3600) / 60);
        const seconds = Math.floor(timestamp % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleAllocationChange = (subjectId: string, value: AllocationOption) => {
        setSubjectAllocations(prev => ({ ...prev, [subjectId]: value }));
    };

    const handleCreatePodcastSpec = async () => {
        console.log('Requesting podcast spec for meeting', meeting.id);
        setIsGeneratingPodcastSpec(true);
        try {
            const subjectsWithAllocation = subjects.map(subject => ({
                ...subject,
                allocation: subjectAllocations[subject.id],
                allocatedMinutes: typeof subjectAllocations[subject.id] === 'number' ? subjectAllocations[subject.id] as number : 0
            }));

            await requestGeneratePodcastSpec(meeting.cityId, meeting.id, subjectsWithAllocation, additionalInstructions);
            toast({
                title: "Podcast Spec Generation Requested",
                description: "The podcast spec generation process has started.",
            });
            setIsPopoverOpen(false);
            setAdditionalInstructions('');
        } catch (error) {
            console.error('Error requesting podcast spec generation:', error);
            toast({
                title: "Error requesting podcast spec generation",
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive'
            });
        } finally {
            setIsGeneratingPodcastSpec(false);
        }
    };

    return (
        <div className="space-y-4">
            {subjects.map(subject => (
                <div key={subject.id} className="flex items-center space-x-2">
                    <Card className={`${options.editable ? 'w-2/3' : 'w-full'}`}>
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
                                            const aTimestamp = transcript.find(s => s.id === a.speakerSegment.id)?.startTimestamp || 0;
                                            const bTimestamp = transcript.find(s => s.id === b.speakerSegment.id)?.startTimestamp || 0;
                                            return aTimestamp - bTimestamp;
                                        })
                                        .map(segment => {
                                            const speakerTag = getSpeakerTag(segment.speakerSegment.speakerTagId);
                                            const person = speakerTag?.personId ? getPerson(speakerTag.personId) : null;
                                            const party = person?.partyId ? getParty(person.partyId) : null;
                                            const segmentTimestamp = transcript.find(s => s.id === segment.speakerSegment.id)?.startTimestamp;
                                            return (
                                                <li key={segment.id} className="text-sm">
                                                    <div onClick={() => handleSpeakerClick(segment.speakerSegment.id)} className="cursor-pointer flex items-center">
                                                        <SpeakerBadge
                                                            speakerTag={speakerTag!}
                                                            person={person!}
                                                            party={party!}
                                                            withLeftBorder={true}
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
                    {options.editable && (
                        <div className="w-1/3">
                            <Select
                                value={subjectAllocations[subject.id]?.toString()}
                                onValueChange={(value) => handleAllocationChange(subject.id, value as AllocationOption)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select allocation" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="onlyMention">Only mention</SelectItem>
                                    <SelectItem value="skip">Skip</SelectItem>
                                    <SelectItem value="1">1 minute</SelectItem>
                                    <SelectItem value="2">2 minutes</SelectItem>
                                    <SelectItem value="3">3 minutes</SelectItem>
                                    <SelectItem value="5">5 minutes</SelectItem>
                                    <SelectItem value="10">10 minutes</SelectItem>
                                    <SelectItem value="15">15 minutes</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            ))}
            {options.editable && (
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button className="mt-4">
                            Create podcast spec
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                        <div className="space-y-4">
                            <h4 className="font-medium">Additional Instructions</h4>
                            <Input
                                type="text"
                                placeholder="Enter additional instructions..."
                                value={additionalInstructions}
                                onChange={(e) => setAdditionalInstructions(e.target.value)}
                            />
                            <Button onClick={handleCreatePodcastSpec} disabled={isGeneratingPodcastSpec}>
                                {isGeneratingPodcastSpec ? 'Generating...' : 'Generate Podcast Spec'}
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}