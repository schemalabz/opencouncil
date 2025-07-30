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
import { Copy, Check, Clock, Hash, FileText, User, Tag } from "lucide-react";
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import { toast } from "@/hooks/use-toast";

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

    // Format the metadata for display
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

    // JSON string for display and copying
    const jsonString = useMemo(() => {
        return JSON.stringify(formattedMetadata, null, 2);
    }, [formattedMetadata]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(jsonString);
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
                        SpeakerSegment Metadata
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

                {/* JSON Content */}
                <ScrollArea className="flex-1 min-h-0">
                    <div className="relative">
                        <Textarea
                            value={jsonString}
                            readOnly
                            className="min-h-[400px] font-mono text-sm resize-none border-0 bg-muted/30"
                            style={{ 
                                whiteSpace: 'pre',
                                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
                            }}
                            aria-label="SpeakerSegment metadata in JSON format"
                        />
                    </div>
                </ScrollArea>

                <DialogFooter className="flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">
                        {jsonString.length.toLocaleString()} characters • {jsonString.split('\n').length} lines
                    </div>
                    <div className="flex gap-2">
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
                        <Button variant="default" onClick={() => onOpenChange(false)}>
                            Close
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 