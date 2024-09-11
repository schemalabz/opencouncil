import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Trash, Users } from "lucide-react";
import { useCouncilMeetingData } from "./meetings/CouncilMeetingDataContext";
import { useTranscriptOptions } from "./meetings/options/OptionsContext";
import { deleteHighlight, getHighlightsForMeeting, HighlightWithUtterances, upsertHighlight } from "@/lib/db/highlights";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import SpeakerTagC from "./SpeakerTag";

const SingleHighlight = ({ highlight, requestUpdate, showSaveButton }: { highlight: HighlightWithUtterances, requestUpdate: () => void, showSaveButton: boolean }) => {
    const { transcript, getSpeakerTag } = useCouncilMeetingData();
    const { updateOptions, options } = useTranscriptOptions();
    const editable = options.editable;
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
        const updatedHighlight = {
            ...highlight,
            highlightedUtterances: highlight.highlightedUtterances.filter(hu => hu.utteranceId !== utteranceId)
        };
        updateOptions({ selectedHighlight: updatedHighlight });
    };

    const handleSave = async () => {
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
                        <div className="flex items-center space-x-1">
                            <Button size="icon" variant="ghost" onClick={(e) => {
                                e.stopPropagation();
                                deleteHighlight(highlight.id);
                                requestUpdate();
                            }}>
                                <Trash className="h-3 w-3 text-muted-foreground" />
                            </Button>
                        </div>
                    </div>
                </div>
                {isSelected && (
                    <div className="mt-2 space-y-2">
                        {utterances.map((utterance, index) => {
                            const segment = transcript.find(s => s.id === utterance.speakerSegmentId);
                            if (!segment) {
                                console.error(`Segment id ${utterance.speakerSegmentId} not found for utterance ${utterance.id}`);
                            }
                            const speakerTag = getSpeakerTag(segment?.speakerTagId!);
                            if (!speakerTag) {
                                console.error("speakerTag not found for segment", segment?.id);
                            }
                            return (
                                <div key={index} className="flex items-center space-x-2">
                                    {speakerTag && <SpeakerTagC speakerTag={speakerTag} className="flex-shrink-0" />}
                                    <p className="text-sm">{utterance.text}</p>
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
                                </div>
                            );
                        })}
                        {showSaveButton && (
                            <Button onClick={handleSave} className="mt-2">
                                Save Changes
                            </Button>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const AddHighlightButton = ({ onHighlightAdded }: { onHighlightAdded: () => void }) => {
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [newHighlightName, setNewHighlightName] = React.useState('');
    const { updateOptions } = useTranscriptOptions();
    const { meeting } = useCouncilMeetingData();

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
    const [highlights, setHighlights] = React.useState(initialHighlights);
    const { meeting } = useCouncilMeetingData();

    const reloadHighlights = React.useCallback(async () => {
        try {
            const updatedHighlights = await getHighlightsForMeeting(meeting.cityId, meeting.id);
            setHighlights(updatedHighlights);
        } catch (error) {
            console.error('Failed to reload highlights:', error);
        }
    }, [meeting.cityId, meeting.id]);

    const selectedHighlight = options.selectedHighlight;

    return (
        <div>
            {options.editable && <AddHighlightButton onHighlightAdded={reloadHighlights} />}
            {highlights.length > 0 ? (
                highlights.map(highlight => (
                    <SingleHighlight
                        key={highlight.id}
                        highlight={selectedHighlight?.id === highlight.id ? selectedHighlight : highlight}
                        requestUpdate={reloadHighlights}
                        showSaveButton={options.editable && selectedHighlight?.id === highlight.id}
                    />
                ))
            ) : (
                <div className="text-muted-foreground">No highlights available</div>
            )}
        </div>
    );
}