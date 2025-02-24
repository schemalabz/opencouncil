import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Download, Trash, Users } from "lucide-react";
import { useCouncilMeetingData } from "./meetings/CouncilMeetingDataContext";
import { useTranscriptOptions } from "./meetings/options/OptionsContext";
import { addHighlightToSubject, deleteHighlight, getHighlightsForMeeting, HighlightWithUtterances, removeHighlightFromSubject, upsertHighlight } from "@/lib/db/highlights";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { requestSplitMediaFileForHighlight } from "@/lib/tasks/splitMediaFile";
import { PersonBadge } from "./persons/PersonBadge";
import { isUserAuthorizedToEdit } from "@/lib/auth";

const SingleHighlight = ({ highlight, requestUpdate, showSaveButton, canEdit }: { highlight: HighlightWithUtterances, requestUpdate: () => void, showSaveButton: boolean, canEdit: boolean }) => {
    const { transcript, getSpeakerTag, subjects, getPerson, getParty } = useCouncilMeetingData();
    const { options, updateOptions } = useTranscriptOptions();

    const utterances = highlight.highlightedUtterances.map(hu =>
        transcript.map((ss) => ss.utterances.find(u => u.id === hu.utteranceId)).find(u => u !== undefined)
    ).filter((u): u is NonNullable<typeof u> => u !== undefined);

    const duration = utterances.reduce((sum, u) => sum + (u.endTimestamp - u.startTimestamp), 0);
    const speakerCount = new Set(utterances.map(u => u.speakerSegmentId)).size;

    const handleClick = () => {
        updateOptions({ selectedHighlight: options.selectedHighlight?.id === highlight.id ? null : highlight });
    };

    const isSelected = options.selectedHighlight?.id === highlight.id;

    const removeUtterance = (utteranceId: string) => {
        if (!canEdit) return;
        const updatedHighlight = {
            ...highlight,
            highlightedUtterances: highlight.highlightedUtterances.filter(hu => hu.utteranceId !== utteranceId)
        };
        updateOptions({ selectedHighlight: updatedHighlight });
    };

    const handleSave = async () => {
        if (!canEdit) return;
        try {
            await upsertHighlight({
                id: highlight.id,
                name: highlight.name,
                meetingId: highlight.meetingId,
                cityId: highlight.cityId,
                utteranceIds: highlight.highlightedUtterances.map(hu => hu.utteranceId)
            });
            requestUpdate();
            toast({
                title: "Success",
                description: "Highlight saved successfully.",
                variant: "default",
            });
        } catch (error) {
            console.error('Failed to save highlight:', error);
            toast({
                title: "Error",
                description: "Failed to save highlight. Please try again.",
                variant: "destructive",
            });
        }
    };

    const handleGenerateVideo = async () => {
        try {
            await requestSplitMediaFileForHighlight(highlight.id);
            toast({
                title: "Success",
                description: "Video generation started. This may take a few minutes.",
                variant: "default",
            });
            // Poll for updates or handle completion notification separately
        } catch (error) {
            console.error('Failed to generate video:', error);
            toast({
                title: "Error",
                description: "Failed to generate video. Please try again.",
                variant: "destructive",
            });
        }
    };

    const formatTimestamp = (timestamp: number) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor(timestamp / 60);
        const seconds = Math.floor(timestamp % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleAddSubject = async (subjectId: string) => {
        if (!canEdit) return;
        try {
            await addHighlightToSubject({ subjectId, highlightId: highlight.id });
            requestUpdate();
            toast({
                title: "Success",
                description: "Subject added to highlight successfully.",
                variant: "default",
            });
        } catch (error) {
            console.error('Failed to add subject to highlight:', error);
            toast({
                title: "Error",
                description: "Failed to add subject to highlight. Please try again.",
                variant: "destructive",
            });
        }
    };

    const handleRemoveSubject = async () => {
        if (!canEdit) return;
        try {
            await removeHighlightFromSubject({ subjectId: highlight.subjectId!, highlightId: highlight.id });
            requestUpdate();
            toast({
                title: "Success",
                description: "Subject removed from highlight successfully.",
                variant: "default",
            });
        } catch (error) {
            console.error('Failed to remove subject from highlight:', error);
            toast({
                title: "Error",
                description: "Failed to remove subject from highlight. Please try again.",
                variant: "destructive",
            });
        }
    };

    return (
        <Card
            className={`mb-2 cursor-pointer ${isSelected ? 'border-primary' : ''}`}
            onClick={handleClick}
        >
            <CardContent className="p-2">
                <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-xs font-normal">
                        {highlight.name}
                    </Badge>
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{duration.toFixed(2)}s</span>
                        </div>
                        <div className="flex items-center space-x-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{speakerCount}</span>
                        </div>
                        {canEdit && (
                            <div className="flex items-center space-x-1">
                                <Button size="icon" variant="ghost" onClick={(e) => {
                                    e.stopPropagation();
                                    deleteHighlight(highlight.id);
                                    requestUpdate();
                                }}>
                                    <Trash className="h-3 w-3 text-muted-foreground" />
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
                {isSelected && (
                    <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap gap-2">
                            {highlight.subjectId && (
                                <Badge variant="secondary">{subjects.find(s => s.id === highlight.subjectId)?.name}
                                    {canEdit && (
                                        <Button size="icon" variant="ghost" onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveSubject();
                                        }}>
                                            <Trash className="h-3 w-3 text-muted-foreground" />
                                        </Button>
                                    )}
                                </Badge>
                            )}
                            {canEdit && (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm">Add Subject</Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-60">
                                        <div className="space-y-2">
                                            {subjects.map((subject) => (
                                                <Button
                                                    key={subject.id}
                                                    onClick={() => handleAddSubject(subject.id)}
                                                    variant="ghost"
                                                    className="w-full justify-start"
                                                >
                                                    {subject.name}
                                                </Button>
                                            ))}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            )}
                        </div>
                        {utterances.map((utterance, index) => {
                            const segment = transcript.find(s => s.id === utterance.speakerSegmentId);
                            if (!segment) {
                                console.error(`Segment id ${utterance.speakerSegmentId} not found for utterance ${utterance.id}`);
                            }
                            const speakerTag = getSpeakerTag(segment?.speakerTagId!);
                            const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
                            const party = person?.partyId ? getParty(person.partyId) : undefined;
                            if (!speakerTag) {
                                console.error("speakerTag not found for segment", segment?.id);
                            }
                            return (
                                <div key={index} className="flex items-center space-x-2">
                                    {speakerTag && <PersonBadge
                                        person={person}
                                        speakerTag={speakerTag}
                                        className="ml-2"
                                    />}
                                    <p className="text-sm">{utterance.text} [{formatTimestamp(utterance.startTimestamp)}]</p>
                                    {canEdit && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-4 w-4 p-0"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeUtterance(utterance.id);
                                            }}
                                        >
                                            <span className="text-xs">×</span>
                                        </Button>
                                    )}
                                </div>
                            );
                        })}
                        <div className="flex justify-between items-center mt-4">
                            {showSaveButton && (
                                <Button onClick={handleSave}>
                                    Save Changes
                                </Button>
                            )}
                            <div className="flex space-x-2">
                                {highlight.videoUrl ? (
                                    <a
                                        href={highlight.videoUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Button variant="outline" size="sm" className="flex items-center space-x-1">
                                            <Download className="h-4 w-4" />
                                            <span>Download Video</span>
                                        </Button>
                                    </a>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleGenerateVideo();
                                        }}
                                        className="flex items-center space-x-1"
                                    >
                                        <span>Generate Video</span>
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const AddHighlightButton = ({ onHighlightAdded }: { onHighlightAdded: () => void }) => {
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [newHighlightName, setNewHighlightName] = React.useState('');
    const { meeting } = useCouncilMeetingData();
    const { updateOptions } = useTranscriptOptions();

    const handleAddHighlight = async () => {
        try {
            const newHighlight = await upsertHighlight({
                name: newHighlightName,
                meetingId: meeting.id,
                cityId: meeting.cityId,
                utteranceIds: []
            });
            updateOptions({ selectedHighlight: newHighlight });
            setIsPopoverOpen(false);
            setNewHighlightName('');
            onHighlightAdded(); // Notify parent component to reload highlights
        } catch (error) {
            console.error('Failed to create highlight:', error);
            toast({
                title: "Error",
                description: "Failed to create highlight. Please try again.",
                variant: "destructive",
            });
        }
    };

    return (
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <PopoverTrigger asChild>
                <Button>Add Highlight</Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
                <div className="space-y-4">
                    <h4 className="font-medium">New Highlight</h4>
                    <Input
                        type="text"
                        placeholder="Highlight name"
                        value={newHighlightName}
                        onChange={(e) => setNewHighlightName(e.target.value)}
                    />
                    <Button onClick={handleAddHighlight}>Add</Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default function Highlights({ highlights: initialHighlights }: { highlights: HighlightWithUtterances[] }) {
    const { options } = useTranscriptOptions();
    const { meeting } = useCouncilMeetingData();
    const [highlights, setHighlights] = React.useState(initialHighlights);
    const [canEdit, setCanEdit] = React.useState(false);

    React.useEffect(() => {
        const checkAuth = async () => {
            const authorized = await isUserAuthorizedToEdit({ councilMeetingId: meeting.id });
            setCanEdit(authorized);
        };
        checkAuth();
    }, [meeting.id]);

    const reloadHighlights = React.useCallback(async () => {
        try {
            const updatedHighlights = await getHighlightsForMeeting(meeting.cityId, meeting.id);
            setHighlights(updatedHighlights);
        } catch (error) {
            console.error('Failed to reload highlights:', error);
        }
    }, [meeting.cityId, meeting.id]);

    return (
        <div>
            {canEdit && <AddHighlightButton onHighlightAdded={reloadHighlights} />}
            {highlights.length > 0 ? (
                highlights.map(highlight => (
                    <SingleHighlight
                        key={highlight.id}
                        highlight={options.selectedHighlight?.id === highlight.id ? options.selectedHighlight : highlight}
                        requestUpdate={reloadHighlights}
                        showSaveButton={canEdit && options.selectedHighlight?.id === highlight.id}
                        canEdit={canEdit}
                    />
                ))
            ) : (
                <div className="text-muted-foreground">No highlights available</div>
            )}
        </div>
    );
}