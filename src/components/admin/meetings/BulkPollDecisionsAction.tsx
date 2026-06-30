'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Gavel, ExternalLink } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';
import { MeetingDecisionCounts } from '@/lib/db/decisions';
import { partitionMeetingsForPolling, MeetingPollEligibility } from '@/lib/tasks/pollableMeetings';
import { requestPollDecisions } from '@/lib/tasks/pollDecisions';
import { useSequentialDispatch } from '@/hooks/useSequentialDispatch';
import { BatchProgressView } from '@/components/admin/BatchProgressView';

interface BulkPollDecisionsActionProps {
    selectedMeetingIds: Set<string>;
    meetings: CouncilMeetingWithAdminBodyAndSubjects[];
    decisionCounts: MeetingDecisionCounts;
    selectedCityId: string;
    cityHasDiavgeiaUid: boolean;
}

export function BulkPollDecisionsAction({
    selectedMeetingIds,
    meetings,
    decisionCounts,
    selectedCityId,
    cityHasDiavgeiaUid,
}: BulkPollDecisionsActionProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [skipCache, setSkipCache] = useState(false);

    const partition = useMemo(() => {
        const selected = meetings
            .filter(m => selectedMeetingIds.has(m.id))
            .map(m => ({ id: m.id, name: m.name }));
        return partitionMeetingsForPolling(selected, decisionCounts);
    }, [meetings, selectedMeetingIds, decisionCounts]);

    const dispatchPoll = useCallback(async (meeting: MeetingPollEligibility) => {
        await requestPollDecisions(selectedCityId, meeting.meetingId, {
            forceExtract: skipCache,
        });
    }, [selectedCityId, skipCache]);

    const dispatch = useSequentialDispatch<MeetingPollEligibility>(dispatchPoll, { throttleMs: 400 });

    const openDialog = () => {
        setSkipCache(false);
        dispatch.reset();
        setDialogOpen(true);
    };

    if (selectedMeetingIds.size === 0) return null;

    return (
        <>
            {cityHasDiavgeiaUid ? (
                <Button variant="outline" size="sm" onClick={openDialog}>
                    <Gavel className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Poll Decisions</span>
                </Button>
            ) : (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span tabIndex={0}>
                                <Button variant="outline" size="sm" disabled>
                                    <Gavel className="w-4 h-4 mr-2" />
                                    <span className="hidden sm:inline">Poll Decisions</span>
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>This city has no Diavgeia UID configured.</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}

            <Dialog open={dialogOpen} onOpenChange={(open) => {
                if (!open && dispatch.phase === 'executing') return;
                setDialogOpen(open);
            }}>
                <DialogContent className="max-w-2xl">
                    {dispatch.phase === 'idle' ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Gavel className="h-5 w-5" />
                                    Poll decisions for {partition.pollable.length} meeting{partition.pollable.length === 1 ? '' : 's'}?
                                </DialogTitle>
                                <DialogDescription asChild>
                                    <div className="space-y-2">
                                        <p>
                                            Dispatches a decision poll for{' '}
                                            <strong>{partition.pollable.length}</strong> meeting{partition.pollable.length === 1 ? '' : 's'}
                                            {' '}one at a time against Diavgeia.
                                            {partition.alreadyCompleteCount > 0 && (
                                                <> <strong>{partition.alreadyCompleteCount}</strong> already have all decisions linked and will be re-polled.</>
                                            )}
                                            {partition.skipped.length > 0 && (
                                                <> <strong>{partition.skipped.length}</strong> selected meeting{partition.skipped.length === 1 ? '' : 's'} will be skipped (Λογοδοσία or no eligible subjects).</>
                                            )}
                                        </p>
                                    </div>
                                </DialogDescription>
                            </DialogHeader>

                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="poll-skip-cache"
                                    checked={skipCache}
                                    onCheckedChange={(checked) => setSkipCache(checked === true)}
                                />
                                <Label htmlFor="poll-skip-cache" className="text-sm font-normal">
                                    Skip extraction cache (re-process Diavgeia PDFs)
                                </Label>
                            </div>

                            <ScrollArea className="max-h-80 border rounded-md">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-background border-b">
                                        <tr>
                                            <th className="text-left p-2 font-medium">Meeting</th>
                                            <th className="text-left p-2 font-medium">Decisions</th>
                                            <th className="text-left p-2 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {partition.pollable.map((m) => (
                                            <tr key={m.meetingId} className="border-b last:border-0">
                                                <td className="p-2">{m.name}</td>
                                                <td className="p-2">
                                                    <Badge variant={m.alreadyComplete ? 'default' : 'outline'}>
                                                        {m.linked}/{m.eligible}
                                                    </Badge>
                                                </td>
                                                <td className="p-2 text-muted-foreground">
                                                    {m.alreadyComplete ? 'Re-poll (complete)' : 'Will poll'}
                                                </td>
                                            </tr>
                                        ))}
                                        {partition.skipped.map((m) => (
                                            <tr key={m.meetingId} className="border-b last:border-0 text-muted-foreground/60">
                                                <td className="p-2">{m.name}</td>
                                                <td className="p-2">
                                                    <Badge variant="outline" className="text-gray-400">
                                                        {m.linked}/{m.eligible}
                                                    </Badge>
                                                </td>
                                                <td className="p-2">
                                                    Skip — {m.skipReason === 'logodosia' ? 'Λογοδοσία' : 'no eligible subjects'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </ScrollArea>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                <Button
                                    onClick={() => dispatch.run(partition.pollable)}
                                    disabled={partition.pollable.length === 0}
                                >
                                    Poll {partition.pollable.length} meeting{partition.pollable.length === 1 ? '' : 's'}
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <BatchProgressView
                            phase={dispatch.phase}
                            items={partition.pollable}
                            currentIndex={dispatch.currentIndex}
                            results={dispatch.results}
                            cancelled={dispatch.cancelled}
                            getItemKey={(m) => m.meetingId}
                            getItemLabel={(m) => m.name}
                            title={{ executing: 'Dispatching polls...', done: 'All polls dispatched' }}
                            currentVerb="Polling"
                            doneExtra={
                                <Link
                                    href="/admin/tasks"
                                    className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                                >
                                    Follow progress in Active Tasks
                                    <ExternalLink className="h-3 w-3" />
                                </Link>
                            }
                            onCancel={dispatch.cancel}
                            onClose={() => setDialogOpen(false)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
