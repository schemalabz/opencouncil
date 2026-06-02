'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, XCircle, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import { formatDate } from '@/lib/formatters/time';
import { batchRerunTask, type BatchRerunResult } from '@/lib/tasks/batchRerun';

export interface BatchMeeting {
    meetingId: string;
    cityId: string;
    cityName: string;
    dateTime: string | null;
    currentVersion: number | null;
}

interface BatchRerunActionsProps {
    meetings: BatchMeeting[];
}

type TaskType = 'processAgenda' | 'summarize';
type DialogState = 'confirm' | 'executing' | 'done';

const TASK_LABELS: Record<TaskType, string> = {
    processAgenda: 'Process Agenda',
    summarize: 'Summarize',
};


export function BatchRerunActions({ meetings }: BatchRerunActionsProps) {
    const t = useTranslations('admin.adminActions');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<TaskType>('processAgenda');
    const [dialogState, setDialogState] = useState<DialogState>('confirm');
    const [results, setResults] = useState<BatchRerunResult[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const cancelledRef = useRef(false);

    const openDialog = (taskType: TaskType) => {
        setSelectedTask(taskType);
        setDialogState('confirm');
        setResults([]);
        setCurrentIndex(0);
        cancelledRef.current = false;
        setDialogOpen(true);
    };

    const handleCancel = () => {
        cancelledRef.current = true;
    };

    const handleClose = () => {
        setDialogOpen(false);
    };

    const handleConfirm = useCallback(async () => {
        setDialogState('executing');
        const newResults: BatchRerunResult[] = [];

        for (let i = 0; i < meetings.length; i++) {
            if (cancelledRef.current) break;

            setCurrentIndex(i);
            const meeting = meetings[i];
            const result = await batchRerunTask(meeting.cityId, meeting.meetingId, selectedTask);
            newResults.push(result);
            setResults([...newResults]);
        }

        setDialogState('done');
    }, [meetings, selectedTask]);

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const remaining = meetings.length - results.length;
    const progressPercent = meetings.length > 0 ? (results.length / meetings.length) * 100 : 0;

    const cityCount = new Set(meetings.map(m => m.cityId)).size;

    const [batchOpen, setBatchOpen] = useState(false);

    return (
        <>
            <Collapsible open={batchOpen} onOpenChange={setBatchOpen} className="border rounded-md">
                <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 text-sm text-muted-foreground hover:bg-gray-50">
                    {batchOpen
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />
                    }
                    Batch Actions
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3">
                    <p className="text-sm text-muted-foreground mb-3">
                        Re-run tasks for all filtered meetings. Useful when the processing algorithm has changed
                        and past meetings need to be reprocessed. Tasks are dispatched one at a time.
                    </p>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={meetings.length === 0}
                            onClick={() => openDialog('processAgenda')}
                        >
                            Re-run Process Agenda
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={meetings.length === 0}
                            onClick={() => openDialog('summarize')}
                        >
                            Re-run Summarize
                        </Button>
                        {meetings.length === 0 && (
                            <span className="text-sm text-muted-foreground">No meetings match current filters</span>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>

            <Dialog open={dialogOpen} onOpenChange={(open) => {
                // Prevent closing during execution by clicking outside
                if (!open && dialogState === 'executing') return;
                setDialogOpen(open);
            }}>
                <DialogContent className="max-w-2xl">
                    {dialogState === 'confirm' && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-destructive" />
                                    Re-run {TASK_LABELS[selectedTask]} for {meetings.length} meetings?
                                </DialogTitle>
                                <DialogDescription asChild>
                                    <div className="space-y-2">
                                        <p>
                                            This will force re-run <strong>{TASK_LABELS[selectedTask]}</strong> for{' '}
                                            <strong>{meetings.length} meetings</strong> across{' '}
                                            <strong>{cityCount} {cityCount === 1 ? 'city' : 'cities'}</strong>.
                                            Tasks will be dispatched one at a time.
                                        </p>
                                        <p className="text-destructive">
                                            {t(`forms.forceDescription.${selectedTask}`)}
                                        </p>
                                    </div>
                                </DialogDescription>
                            </DialogHeader>

                            <ScrollArea className="max-h-80 border rounded-md">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-background border-b">
                                        <tr>
                                            <th className="text-left p-2 font-medium">Date</th>
                                            <th className="text-left p-2 font-medium">Meeting</th>
                                            <th className="text-left p-2 font-medium">City</th>
                                            <th className="text-left p-2 font-medium">Version</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {meetings.map((meeting) => (
                                            <tr key={`${meeting.cityId}-${meeting.meetingId}`} className="border-b last:border-0">
                                                <td className="p-2 whitespace-nowrap">
                                                    {meeting.dateTime ? formatDate(new Date(meeting.dateTime)) : '—'}
                                                </td>
                                                <td className="p-2">
                                                    <a
                                                        href={`/${meeting.cityId}/${meeting.meetingId}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-mono text-xs text-blue-600 hover:underline"
                                                    >
                                                        {meeting.meetingId}
                                                    </a>
                                                </td>
                                                <td className="p-2">{meeting.cityName}</td>
                                                <td className="p-2">
                                                    {meeting.currentVersion !== null
                                                        ? <Badge variant="outline">v{meeting.currentVersion}</Badge>
                                                        : <Badge variant="outline" className="text-gray-400">unversioned</Badge>
                                                    }
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </ScrollArea>

                            <DialogFooter>
                                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                                <Button variant="destructive" onClick={handleConfirm}>
                                    Confirm Re-run
                                </Button>
                            </DialogFooter>
                        </>
                    )}

                    {(dialogState === 'executing' || dialogState === 'done') && (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    {dialogState === 'executing'
                                        ? `Dispatching ${TASK_LABELS[selectedTask]}...`
                                        : `${TASK_LABELS[selectedTask]} — All Tasks Dispatched`
                                    }
                                </DialogTitle>
                                <DialogDescription>
                                    {succeeded} dispatched, {failed} failed
                                    {remaining > 0 && `, ${remaining} remaining`}
                                    {cancelledRef.current && ' (cancelled)'}
                                </DialogDescription>
                            </DialogHeader>

                            <Progress value={progressPercent} className="w-full" />

                            {dialogState === 'executing' && currentIndex < meetings.length && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Processing: {meetings[currentIndex].cityId}/{meetings[currentIndex].meetingId}
                                </div>
                            )}

                            <ScrollArea className="max-h-60 border rounded-md">
                                <div className="p-2 space-y-1">
                                    {results.map((result) => (
                                        <div key={`${result.cityId}-${result.meetingId}`} className="flex items-center gap-2 text-sm">
                                            {result.success
                                                ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                                : <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                                            }
                                            <span className="font-mono text-xs">{result.cityId}/{result.meetingId}</span>
                                            {result.error && (
                                                <span className="text-red-600 text-xs truncate">— {result.error}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>

                            <DialogFooter>
                                {dialogState === 'executing' ? (
                                    <Button variant="destructive" onClick={handleCancel}>
                                        Cancel
                                    </Button>
                                ) : (
                                    <Button variant="outline" onClick={handleClose}>
                                        Close
                                    </Button>
                                )}
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
