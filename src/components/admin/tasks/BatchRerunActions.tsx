'use client';

import { useState, useCallback } from 'react';
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
import { AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react';
import { formatDate } from '@/lib/formatters/time';
import { batchRerunTask } from '@/lib/tasks/batchRerun';
import { useSequentialDispatch } from '@/hooks/useSequentialDispatch';
import { BatchProgressView } from '@/components/admin/BatchProgressView';

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

const TASK_LABELS: Record<TaskType, string> = {
    processAgenda: 'Process Agenda',
    summarize: 'Summarize',
};

export function BatchRerunActions({ meetings }: BatchRerunActionsProps) {
    const t = useTranslations('admin.adminActions');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<TaskType>('processAgenda');
    const [batchOpen, setBatchOpen] = useState(false);

    const dispatchTask = useCallback(async (meeting: BatchMeeting) => {
        const result = await batchRerunTask(meeting.cityId, meeting.meetingId, selectedTask);
        if (!result.success) {
            throw new Error(result.error ?? 'Dispatch failed');
        }
    }, [selectedTask]);

    const dispatch = useSequentialDispatch<BatchMeeting>(dispatchTask);

    const openDialog = (taskType: TaskType) => {
        setSelectedTask(taskType);
        dispatch.reset();
        setDialogOpen(true);
    };

    const cityCount = new Set(meetings.map(m => m.cityId)).size;

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
                if (!open && dispatch.phase === 'executing') return;
                setDialogOpen(open);
            }}>
                <DialogContent className="max-w-2xl">
                    {dispatch.phase === 'idle' ? (
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

                            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                <p className="text-amber-800">
                                    {selectedTask === 'processAgenda' ? 'Before meeting' : 'After meeting'} notifications
                                    will be created for meetings whose administrative body has notifications enabled.
                                    Check each body&apos;s notification behavior setting if this is not intended.
                                </p>
                            </div>

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
                                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                <Button variant="destructive" onClick={() => dispatch.run(meetings)}>
                                    Confirm Re-run
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <BatchProgressView
                            phase={dispatch.phase}
                            items={meetings}
                            currentIndex={dispatch.currentIndex}
                            results={dispatch.results}
                            cancelled={dispatch.cancelled}
                            getItemKey={(m) => `${m.cityId}-${m.meetingId}`}
                            getItemLabel={(m) => `${m.cityId}/${m.meetingId}`}
                            title={{
                                executing: `Dispatching ${TASK_LABELS[selectedTask]}...`,
                                done: `${TASK_LABELS[selectedTask]} — All Tasks Dispatched`,
                            }}
                            currentVerb="Processing"
                            monospaceLabels
                            onCancel={dispatch.cancel}
                            onClose={() => setDialogOpen(false)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
