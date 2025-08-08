import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Download, Trash, Users, Star, Edit } from "lucide-react";
import { useCouncilMeetingData } from "./meetings/CouncilMeetingDataContext";
import { useHighlight } from "./meetings/HighlightContext";
import { addHighlightToSubject, deleteHighlight, getHighlightsForMeeting, HighlightWithUtterances, removeHighlightFromSubject, toggleHighlightShowcase, upsertHighlight } from "@/lib/db/highlights";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { requestSplitMediaFileForHighlight } from "@/lib/tasks/splitMediaFile";
import { PersonBadge } from "./persons/PersonBadge";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import { HighlightVideo } from '@/components/meetings/HighlightVideo';
import { getPartyFromRoles } from "@/lib/utils";

const SingleHighlight = ({ highlight, requestUpdate, showSaveButton, canEdit }: { highlight: HighlightWithUtterances, requestUpdate: () => void, showSaveButton: boolean, canEdit: boolean }) => {
    const { transcript, getSpeakerTag, subjects, getPerson, getParty } = useCouncilMeetingData();
    const { setEditingHighlight, editingHighlight, statistics, highlightUtterances } = useHighlight();

    // Use statistics from context if this is the editing highlight, otherwise calculate locally
    const isEditingThisHighlight = editingHighlight?.id === highlight.id;
    
    // Use pre-calculated utterances if available, otherwise calculate locally
    const utterances = isEditingThisHighlight && highlightUtterances
        ? highlightUtterances
        : highlight.highlightedUtterances.map(hu =>
            transcript.map((ss) => ss.utterances.find(u => u.id === hu.utteranceId)).find(u => u !== undefined)
        ).filter((u): u is NonNullable<typeof u> => u !== undefined);

    const duration = isEditingThisHighlight && statistics 
        ? statistics.duration
        : utterances.reduce((sum, u) => sum + (u.endTimestamp - u.startTimestamp), 0);
    
    const speakerCount = isEditingThisHighlight && statistics
        ? statistics.speakerCount
        : new Set(utterances.map(u => u.speakerSegmentId)).size;

    const handleClick = () => {
        // If we're in editing mode, don't allow switching highlights
        if (editingHighlight) return;
        
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingHighlight(highlight);
    };

    const handleDelete = async () => {
        // If we're deleting the highlight that's currently being edited, clear the editing state
        if (editingHighlight?.id === highlight.id) {
            setEditingHighlight(null);
        }
        
        try {
            await deleteHighlight(highlight.id);
            requestUpdate();
            toast({
                title: "Success",
                description: "Highlight deleted successfully.",
                variant: "default",
            });
        } catch (error) {
            console.error('Failed to delete highlight:', error);
            toast({
                title: "Error",
                description: "Failed to delete highlight. Please try again.",
                variant: "destructive",
            });
        }
    };

    const isBeingEdited = editingHighlight?.id === highlight.id;

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

    const handleToggleShowcase = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!canEdit) return;
        try {
            await toggleHighlightShowcase(highlight.id);
            requestUpdate();
            toast({
                title: "Success",
                description: highlight.isShowcased ? "Highlight removed from showcase." : "Highlight added to showcase.",
                variant: "default",
            });
        } catch (error) {
            console.error('Failed to toggle showcase:', error);
            toast({
                title: "Error",
                description: "Failed to toggle showcase status. Please try again.",
                variant: "destructive",
            });
        }
    };

    return (
        <Card
            className={`mb-2 cursor-pointer ${isBeingEdited ? 'bg-primary/5 border-primary border-2' : ''}`}
            onClick={handleClick}
        >
            <CardContent className="p-2">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs font-normal">
                            {highlight.name}
                        </Badge>
                        {isBeingEdited && (
                            <Badge variant="default" className="text-xs font-normal flex items-center">
                                <Edit className="w-3 h-3 mr-1" />
                                Editing
                            </Badge>
                        )}
                        {highlight.isShowcased && (
                            <Badge variant="secondary" className="text-xs font-normal flex items-center">
                                <Star className="w-3 h-3 mr-1" />
                                Showcased
                            </Badge>
                        )}
                    </div>
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
                                <Button
                                    size="icon"
                                    variant={isBeingEdited ? "default" : "outline"}
                                    onClick={handleEdit}
                                    disabled={!!editingHighlight && !isBeingEdited}
                                    title="Edit highlight"
                                >
                                    <Edit className="h-3 w-3" />
                                </Button>
                                {highlight.muxPlaybackId && (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={handleToggleShowcase}
                                        className={highlight.isShowcased ? "text-yellow-500" : ""}
                                    >
                                        <Star className="h-3 w-3" />
                                    </Button>
                                )}
                                <Button size="icon" variant="ghost" onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete();
                                }}>
                                    <Trash className="h-3 w-3 text-muted-foreground" />
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
                {isBeingEdited && (
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
                        {highlight.muxPlaybackId && (
                            <div className="mb-4">
                                <HighlightVideo
                                    id={highlight.id}
                                    title={highlight.name}
                                    playbackId={highlight.muxPlaybackId}
                                />
                            </div>
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
    const { meeting } = useCouncilMeetingData();

    const handleAddHighlight = async () => {
        try {
            const newHighlight = await upsertHighlight({
                name: newHighlightName,
                meetingId: meeting.id,
                cityId: meeting.cityId,
                utteranceIds: []
            });
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
    const { meeting } = useCouncilMeetingData();
    const [highlights, setHighlights] = React.useState(initialHighlights);
    const [canEdit, setCanEdit] = React.useState(false);

    React.useEffect(() => {
        const checkAuth = async () => {
            const authorized = await isUserAuthorizedToEdit({ cityId: meeting.cityId });
            setCanEdit(authorized);
        };
        checkAuth();
    }, [meeting.cityId]);

    const reloadHighlights = React.useCallback(async () => {
        try {
            const updatedHighlights = await getHighlightsForMeeting(meeting.cityId, meeting.id);
            setHighlights(updatedHighlights);
        } catch (error) {
            console.error('Failed to reload highlights:', error);
        }
    }, [meeting.cityId, meeting.id]);

    const showcasedHighlights = highlights.filter(h => h.isShowcased);
    const regularHighlights = highlights.filter(h => !h.isShowcased);

    return (
        <div>
            {canEdit && <AddHighlightButton onHighlightAdded={reloadHighlights} />}
            {showcasedHighlights.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                        <Star className="w-4 h-4 mr-2 text-yellow-500" />
                        Showcased Highlights
                    </h3>
                    {showcasedHighlights.map(highlight => (
                        <SingleHighlight
                            key={highlight.id}
                            highlight={highlight}
                            requestUpdate={reloadHighlights}
                            showSaveButton={false}
                            canEdit={canEdit}
                        />
                    ))}
                </div>
            )}
            {regularHighlights.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold mb-4">All Highlights</h3>
                    {regularHighlights.map(highlight => (
                        <SingleHighlight
                            key={highlight.id}
                            highlight={highlight}
                            requestUpdate={reloadHighlights}
                            showSaveButton={false}
                            canEdit={canEdit}
                        />
                    ))}
                </div>
            )}
            {highlights.length === 0 && (
                <div className="text-muted-foreground">No highlights available</div>
            )}
        </div>
    );
}