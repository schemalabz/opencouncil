"use client";

import { useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Hash, User, Tag, Edit, AlertTriangle, Plus } from "lucide-react";
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import { formatTimestamp } from "@/lib/utils";
import { JsonMetadataDialog } from '@/components/ui/json-metadata-dialog';
import { useSpeakerSegmentEditor } from '@/hooks/useSpeakerSegmentEditor';

interface SpeakerSegmentMetadataDialogProps {
    segment: TranscriptType[number];
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function SpeakerSegmentMetadataDialog({
    segment,
    open,
    onOpenChange
}: SpeakerSegmentMetadataDialogProps) {
    const editor = useSpeakerSegmentEditor(segment);

    const formatTimestampWithMs = (timestamp: number) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor((timestamp % 3600) / 60);
        const seconds = Math.floor(timestamp % 60);
        const ms = Math.floor((timestamp % 1) * 1000);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    };

    // Compute additional metadata for debugging and display
    const computedMetadata = useMemo(() => {
        const duration = segment.endTimestamp - segment.startTimestamp;
        const utteranceCount = segment.utterances.length;
        const totalWordCount = segment.utterances.reduce((count, utterance) => {
            return count + (utterance.text?.split(/\s+/).filter(word => word.length > 0).length || 0);
        }, 0);
        const averageUtteranceDuration = utteranceCount > 0
            ? segment.utterances.reduce((sum, u) => sum + (u.endTimestamp - u.startTimestamp), 0) / utteranceCount
            : 0;

        return {
            duration,
            utteranceCount,
            totalWordCount,
            averageUtteranceDuration,
            hasText: totalWordCount > 0,
            hasSummary: Boolean(segment.summary),
            hasTopicLabels: segment.topicLabels.length > 0,
            speakerAssigned: Boolean(segment.speakerTag.personId)
        };
    }, [segment]);

    // Prepare formatted metadata for the reusable dialog
    const formattedMetadata = useMemo(() => ({
        id: segment.id,
        startTimestamp: segment.startTimestamp,
        startTimestamp_formatted: formatTimestampWithMs(segment.startTimestamp),
        endTimestamp: segment.endTimestamp,
        endTimestamp_formatted: formatTimestampWithMs(segment.endTimestamp),
        createdAt: segment.createdAt,
        updatedAt: segment.updatedAt,
        meetingId: segment.meetingId,
        cityId: segment.cityId,
        speakerTagId: segment.speakerTagId,
        speakerTag: segment.speakerTag,
        utterances: segment.utterances.map(utterance => ({
            ...utterance,
            duration: utterance.endTimestamp - utterance.startTimestamp,
            wordCount: utterance.text?.split(/\s+/).filter(word => word.length > 0).length || 0
        })),
        topicLabels: segment.topicLabels,
        summary: segment.summary,
        _computed: computedMetadata
    }), [segment, computedMetadata]);

    const metadataItems = useMemo(() => ([
        {
            label: 'Segment ID',
            value: segment.id,
            icon: <Hash className="h-3 w-3" />
        },
        {
            label: 'Time',
            value: `${formatTimestamp(segment.startTimestamp)} - ${formatTimestamp(segment.endTimestamp)}`,
            icon: <Clock className="h-3 w-3" />
        },
        {
            label: 'Speaker',
            value: segment.speakerTag.personId ? 'Assigned Speaker' : 'Unassigned',
            icon: <User className="h-3 w-3" />
        }
    ]), [segment]);

    const badgeItems = useMemo(() => ([
        {
            label: `${computedMetadata.utteranceCount} utterances`,
            variant: 'secondary' as const,
            icon: <Hash className="h-3 w-3" />
        },
        {
            label: `${computedMetadata.totalWordCount} words`,
            variant: 'secondary' as const,
            icon: <Hash className="h-3 w-3" />
        },
        {
            label: `${computedMetadata.duration.toFixed(1)}s duration`,
            variant: 'secondary' as const,
            icon: <Clock className="h-3 w-3" />
        },
        ...(computedMetadata.hasSummary ? [{
            label: 'Has Summary',
            variant: 'outline' as const
        }] : []),
        ...(computedMetadata.hasTopicLabels ? [{
            label: `${segment.topicLabels.length} topics`,
            variant: 'outline' as const,
            icon: <Tag className="h-3 w-3" />
        }] : [])
    ]), [computedMetadata, segment.topicLabels.length]);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && editor.isEditMode) {
            editor.actions.cancelEdit();
        }
        onOpenChange(nextOpen);
    };

    if (!editor.isEditMode) {
        return (
            <JsonMetadataDialog
                open={open}
                onOpenChange={handleOpenChange}
                title="SpeakerSegment Metadata"
                data={formattedMetadata}
                metadata={metadataItems}
                badges={badgeItems}
                footerActions={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={editor.actions.enterEditMode}
                        className="flex items-center gap-2"
                    >
                        <Edit className="h-4 w-4" />
                        Edit Data
                    </Button>
                }
            />
        );
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        SpeakerSegment Editor
                    </DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="flex items-center gap-1">
                            <Hash className="h-3 w-3" />
                            {segment.id}
                        </span>
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimestamp(segment.startTimestamp)} - {formatTimestamp(segment.endTimestamp)}
                        </span>
                        <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {segment.speakerTag.personId ? 'Assigned Speaker' : 'Unassigned'}
                        </span>
                        <Badge variant="secondary" className="flex items-center gap-1">
                            <Edit className="h-3 w-3" />
                            Edit Mode
                        </Badge>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap gap-2 py-2 border-b">
                    <Badge variant="secondary" className="flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {computedMetadata.utteranceCount} utterances
                    </Badge>
                    <Badge variant="secondary" className="flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {computedMetadata.totalWordCount} words
                    </Badge>
                    <Badge variant="secondary" className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {computedMetadata.duration.toFixed(1)}s duration
                    </Badge>
                    {computedMetadata.hasSummary && (
                        <Badge variant="outline">Has Summary</Badge>
                    )}
                    {computedMetadata.hasTopicLabels && (
                        <Badge variant="outline" className="flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            {segment.topicLabels.length} topics
                        </Badge>
                    )}
                </div>

                {editor.validationErrors.length > 0 && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <div className="space-y-1">
                                {editor.validationErrors.map((error, index) => (
                                    <div key={index}>• {error}</div>
                                ))}
                            </div>
                        </AlertDescription>
                    </Alert>
                )}

                <ScrollArea className="flex-1 min-h-0">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                Edit utterances and summary data. Remove utterances by deleting them from the array.
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={editor.actions.addEmptyUtterance}
                                className="flex items-center gap-1"
                            >
                                <Plus className="h-3 w-3" />
                                Add Empty Utterance
                            </Button>
                        </div>
                        <Textarea
                            value={editor.editedData}
                            onChange={(e) => editor.actions.updateEditedData(e.target.value)}
                            className="min-h-[400px] font-mono text-sm resize-none"
                            style={{
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
                            }}
                            placeholder="Edit the JSON data..."
                            aria-label="Editable JSON data for SpeakerSegment"
                        />
                    </div>
                </ScrollArea>

                <DialogFooter className="flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">
                        {`${editor.editedData.length.toLocaleString()} characters • ${editor.editedData.split('\n').length} lines`}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={editor.actions.cancelEdit}
                            disabled={editor.isSaving}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={editor.actions.saveChanges}
                            disabled={editor.isSaving || editor.validationErrors.length > 0}
                        >
                            {editor.isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}