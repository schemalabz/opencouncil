"use client";

import React, { useMemo, useState } from 'react';
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
import { Copy, Check, Clock, Hash, FileText, User, Tag, Edit, AlertTriangle, Plus } from "lucide-react";
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import { toast } from "@/hooks/use-toast";
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
    const [copied, setCopied] = useState(false);
    const editor = useSpeakerSegmentEditor(segment);

    // Compute additional metadata for debugging
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

    // Format the metadata for display (read-only mode)
    const formattedMetadata = useMemo(() => {
        const formatTimestamp = (timestamp: number) => {
            const hours = Math.floor(timestamp / 3600);
            const minutes = Math.floor((timestamp % 3600) / 60);
            const seconds = Math.floor(timestamp % 60);
            const ms = Math.floor((timestamp % 1) * 1000);
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
        };

        return {
            // Core segment data
            id: segment.id,
            startTimestamp: segment.startTimestamp,
            startTimestamp_formatted: formatTimestamp(segment.startTimestamp),
            endTimestamp: segment.endTimestamp,
            endTimestamp_formatted: formatTimestamp(segment.endTimestamp),
            createdAt: segment.createdAt,
            updatedAt: segment.updatedAt,
            meetingId: segment.meetingId,
            cityId: segment.cityId,
            speakerTagId: segment.speakerTagId,

            // Related entities
            speakerTag: segment.speakerTag,
            utterances: segment.utterances.map(utterance => ({
                ...utterance,
                duration: utterance.endTimestamp - utterance.startTimestamp,
                wordCount: utterance.text?.split(/\s+/).filter(word => word.length > 0).length || 0
            })),
            topicLabels: segment.topicLabels,
            summary: segment.summary,

            // Computed metadata for debugging
            _computed: computedMetadata
        };
    }, [segment, computedMetadata]);

    // JSON string for display and copying (read-only mode)
    const jsonString = useMemo(() => {
        return JSON.stringify(formattedMetadata, null, 2);
    }, [formattedMetadata]);

    const handleCopy = async () => {
        try {
            const contentToCopy = editor.isEditMode ? editor.editedData : jsonString;
            await navigator.clipboard.writeText(contentToCopy);
            setCopied(true);
            toast({
                description: "Metadata copied to clipboard",
            });
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            toast({
                variant: "destructive",
                description: "Failed to copy to clipboard",
            });
        }
    };

    const formatTimestamp = (timestamp: number) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor((timestamp % 3600) / 60);
        const seconds = Math.floor(timestamp % 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        SpeakerSegment {editor.isEditMode ? 'Editor' : 'Metadata'}
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
                        {editor.isEditMode && (
                            <Badge variant="secondary" className="flex items-center gap-1">
                                <Edit className="h-3 w-3" />
                                Edit Mode
                            </Badge>
                        )}
                    </DialogDescription>
                </DialogHeader>

                {/* Quick Stats */}
                <div className="flex flex-wrap gap-2 py-2 border-b">
                    <Badge variant="secondary" className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
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

                {/* Validation Errors */}
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

                {/* Content Area */}
                <ScrollArea className="flex-1 min-h-0">
                    <div className="relative">
                        {editor.isEditMode ? (
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
                        ) : (
                            <Textarea
                                value={jsonString}
                                readOnly
                                className="min-h-[400px] font-mono text-sm resize-none border-0 bg-muted/30"
                                style={{ 
                                    whiteSpace: 'pre-wrap',
                                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
                                }}
                                aria-label="SpeakerSegment metadata in JSON format"
                            />
                        )}
                    </div>
                </ScrollArea>

                <DialogFooter className="flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">
                        {editor.isEditMode 
                            ? `${editor.editedData.length.toLocaleString()} characters • ${editor.editedData.split('\n').length} lines`
                            : `${jsonString.length.toLocaleString()} characters • ${jsonString.split('\n').length} lines`
                        }
                    </div>
                    <div className="flex gap-2">
                        {editor.isEditMode ? (
                            <>
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
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCopy}
                                    className="flex items-center gap-2"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="h-4 w-4" />
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="h-4 w-4" />
                                            Copy JSON
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={editor.actions.enterEditMode}
                                    className="flex items-center gap-2"
                                >
                                    <Edit className="h-4 w-4" />
                                    Edit Data
                                </Button>
                                <Button variant="default" onClick={() => onOpenChange(false)}>
                                    Close
                                </Button>
                            </>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 