"use client";

import { useState, useEffect, useMemo } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Bug } from 'lucide-react';
import { formatTimestamp } from '@/lib/formatters/time';

type DebugUtterance = {
    id: string;
    text: string;
    startTimestamp: number;
    endTimestamp: number;
    discussionStatus: 'SUBJECT_DISCUSSION' | 'VOTE' | null;
    speakerSegment: {
        speakerTag: {
            label: string;
            person: {
                name: string;
            } | null;
        };
    };
};

interface DebugUtterancesProps {
    subjectId: string;
}

export function DebugUtterances({ subjectId }: DebugUtterancesProps) {
    const [utterances, setUtterances] = useState<DebugUtterance[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

    useEffect(() => {
        // Only fetch when opened
        if (open && utterances === null) {
            setLoading(true);
            fetch('/api/subject/debug-utterances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subjectId })
            })
                .then(res => {
                    if (res.status === 403) {
                        setIsAuthorized(false);
                        return null;
                    }
                    if (!res.ok) throw new Error('Failed to fetch');
                    return res.json();
                })
                .then(data => {
                    if (data) {
                        setUtterances(data.utterances || []);
                        setIsAuthorized(true);
                    }
                    setLoading(false);
                })
                .catch(() => {
                    setUtterances([]);
                    setIsAuthorized(false);
                    setLoading(false);
                });
        }
    }, [open, utterances, subjectId]);

    // Calculate statistics (memoized to avoid redundant filtering)
    const statistics = useMemo(() => {
        if (!utterances) return { discussionCount: 0, voteCount: 0, discussionTime: 0, voteTime: 0 };

        let discussionCount = 0;
        let voteCount = 0;
        let discussionTime = 0;
        let voteTime = 0;

        for (const utterance of utterances) {
            const duration = utterance.endTimestamp - utterance.startTimestamp;
            if (utterance.discussionStatus === 'SUBJECT_DISCUSSION') {
                discussionCount++;
                discussionTime += duration;
            } else if (utterance.discussionStatus === 'VOTE') {
                voteCount++;
                voteTime += duration;
            }
        }

        return { discussionCount, voteCount, discussionTime, voteTime };
    }, [utterances]);

    // Don't render if user is not authorized
    if (isAuthorized === false) {
        return null;
    }

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <div className="rounded-lg">
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between hover:bg-muted">
                        <div className="flex items-center gap-2">
                            <Bug className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">
                                Debug: Tagged Utterances
                            </span>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                    </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="mt-4 space-y-4 pt-4 border-t">
                    {loading && (
                        <div className="text-sm text-muted-foreground text-center py-4">
                            Loading utterances...
                        </div>
                    )}

                    {!loading && utterances && utterances.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-4">
                            No tagged utterances
                        </div>
                    )}

                    {!loading && utterances && utterances.length > 0 && (
                        <>
                            {/* Statistics */}
                            <div className="flex flex-wrap gap-3 text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Total:</span>
                                    <Badge variant="secondary">{utterances.length} utterances</Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Discussion:</span>
                                    <Badge variant="default">
                                        {statistics.discussionCount} ({(statistics.discussionTime / 60).toFixed(1)}m)
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Vote:</span>
                                    <Badge variant="outline">
                                        {statistics.voteCount} ({(statistics.voteTime / 60).toFixed(1)}m)
                                    </Badge>
                                </div>
                            </div>

                            {/* Utterance list */}
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {utterances.map((utterance, idx) => {
                                    const speakerName = utterance.speakerSegment.speakerTag.person?.name
                                        || utterance.speakerSegment.speakerTag.label;
                                    const duration = utterance.endTimestamp - utterance.startTimestamp;

                                    return (
                                        <div
                                            key={utterance.id}
                                            className="bg-white dark:bg-gray-900 rounded border p-3 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-muted-foreground">
                                                        #{idx + 1}
                                                    </span>
                                                    <span className="font-medium">{speakerName}</span>
                                                </div>
                                                <Badge
                                                    variant={utterance.discussionStatus === 'SUBJECT_DISCUSSION' ? 'default' : 'outline'}
                                                    className="shrink-0"
                                                >
                                                    {utterance.discussionStatus === 'SUBJECT_DISCUSSION' ? 'DISCUSSION' : 'VOTE'}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                                <span className="font-mono">
                                                    {formatTimestamp(utterance.startTimestamp)}
                                                </span>
                                                <span>→</span>
                                                <span className="font-mono">
                                                    {formatTimestamp(utterance.endTimestamp)}
                                                </span>
                                                <span className="text-xs">
                                                    ({duration.toFixed(1)}s)
                                                </span>
                                            </div>
                                            <p className="text-foreground line-clamp-2">
                                                {utterance.text}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}
