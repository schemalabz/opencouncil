"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { VoicePrint, TaskStatus } from "@prisma/client";
import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ListMusic, Loader2, Play, Trash, Volume2 } from "lucide-react";
import { deleteVoicePrint } from "@/lib/db/voiceprints";
import {
    requestGenerateVoiceprint,
    requestGenerateVoiceprintForSegment,
    getCandidateSegmentsForVoiceprint,
    type VoiceprintCandidateSegment,
} from "@/lib/tasks/generateVoiceprint";
import { VOICEPRINT_DURATION } from "@/lib/tasks/voiceprintWindow";
import { deleteTaskStatus, getVoiceprintTasksForPerson } from "@/lib/db/tasks";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import TaskList from "@/components/meetings/admin/TaskList";
import { formatDuration, formatTimestamp } from "@/lib/formatters/time";
import { cn } from "@/lib/utils";

interface VoiceprintActionsProps {
    personId: string;
    personName: string;
    voicePrint: VoicePrint | null;
}

const POLLING_INTERVAL = 3000;

export function VoiceprintActions({ personId, personName, voicePrint }: VoiceprintActionsProps) {
    const router = useRouter();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [tasks, setTasks] = useState<TaskStatus[]>([]);
    const [isLoadingTasks, setIsLoadingTasks] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [latestPendingTask, setLatestPendingTask] = useState<TaskStatus | null>(null);
    const [isManualOpen, setIsManualOpen] = useState(false);
    const [candidates, setCandidates] = useState<VoiceprintCandidateSegment[]>([]);
    const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
    const [candidatesLoaded, setCandidatesLoaded] = useState(false);
    const [candidatesError, setCandidatesError] = useState(false);
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
    // Identifies the latest candidate-load request. Bumped on every load and on
    // dialog close, so a stale in-flight fetch can detect it has been superseded
    // and skip its state updates instead of clobbering a fresh load.
    const loadRequestIdRef = useRef(0);
    const { toast } = useToast();

    // Reset the manual picker whenever the dialog closes so reopening starts clean
    // (no stale candidates expanded, no previously highlighted segment that could be
    // generated from by accident).
    const handleDialogOpenChange = useCallback((open: boolean) => {
        setIsDialogOpen(open);
        if (!open) {
            // Invalidate any in-flight candidate load so its result is ignored.
            loadRequestIdRef.current += 1;
            setIsManualOpen(false);
            setSelectedSegmentId(null);
            setCandidates([]);
            setCandidatesLoaded(false);
            setCandidatesError(false);
            // Clear the spinner too: otherwise a fetch interrupted by close stays
            // "loading", and on reopen handleToggleManual's guard blocks a fresh
            // fetch, leaving the picker stuck on the spinner.
            setIsLoadingCandidates(false);
        }
    }, []);

    const fetchTaskStatuses = useCallback(async () => {
        try {
            const tasks = await getVoiceprintTasksForPerson(personId);
            setTasks(tasks);
            if (tasks.length > 0) {
                const latestTask = tasks[0];
                if (latestTask.status === "pending") {
                    setLatestPendingTask(latestTask);
                } else if (latestTask.status === "succeeded" && !voicePrint) {
                    const voiceprintJustGenerated = Date.now() - latestTask.updatedAt.getTime() < 2 * POLLING_INTERVAL;
                    if (voiceprintJustGenerated) {
                        // a new voiceprint has just been generated
                        // we need to refresh because the generation
                        // occurs as part of a background task
                        router.refresh();
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching task statuses:", error);
            toast({
                title: "Error fetching task statuses",
                description: error instanceof Error ? error.message : "An unknown error occurred",
                variant: "destructive",
            });
        } finally {
            setIsLoadingTasks(false);
        }
    }, [personId, toast, router, voicePrint]);

    // Initial check for tasks when dialog opens
    useEffect(() => {
        if (!isDialogOpen) return;
        fetchTaskStatuses();
    }, [isDialogOpen, fetchTaskStatuses]);

    // reset loading state when voiceprint changes
    // this is useful because we get a new voiceprint
    // state from the main page
    useEffect(() => {
        setIsLoading(false);
        setLatestPendingTask(null);
    }, [voicePrint]);

    // Setup polling when there's a pending task
    useEffect(() => {
        if (!isDialogOpen || !latestPendingTask) return;
        const intervalId = setInterval(fetchTaskStatuses, POLLING_INTERVAL);
        return () => clearInterval(intervalId);
    }, [isDialogOpen, latestPendingTask, fetchTaskStatuses]);

    const handleGenerateVoiceprint = async () => {
        setIsLoading(true);
        try {
            const task = await requestGenerateVoiceprint(personId);

            // Set pending task to automatically start polling
            setLatestPendingTask(task);
            // optimistically add task to tasks list
            setTasks(prev => [task, ...prev]);

            toast({
                title: "Voiceprint generation requested",
                description: "Voiceprint generation is now processing. You can track progress in this dialog.",
            });
        } catch (error) {
            console.error("Error generating voiceprint:", error);
            toast({
                title: "Error",
                description:
                    typeof error === "object" && error !== null && "message" in error
                        ? String(error.message)
                        : "Failed to generate voiceprint. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const loadCandidates = useCallback(async () => {
        const requestId = (loadRequestIdRef.current += 1);
        const isCurrent = () => requestId === loadRequestIdRef.current;
        setIsLoadingCandidates(true);
        setCandidatesError(false);
        try {
            const segments = await getCandidateSegmentsForVoiceprint(personId);
            if (!isCurrent()) return; // dialog closed/reopened — don't clobber fresh state
            setCandidates(segments);
            setCandidatesLoaded(true);
        } catch (error) {
            if (!isCurrent()) return;
            console.error("Error loading candidate segments:", error);
            // Flag the error so the panel shows a retry affordance instead of
            // falling through to the misleading "No segments" empty state.
            setCandidatesError(true);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to load candidate segments.",
                variant: "destructive",
            });
        } finally {
            if (isCurrent()) {
                setIsLoadingCandidates(false);
            }
        }
    }, [personId, toast]);

    const handleToggleManual = () => {
        const next = !isManualOpen;
        setIsManualOpen(next);
        if (next && !candidatesLoaded && !isLoadingCandidates) {
            loadCandidates();
        }
    };

    const handleGenerateFromSegment = async () => {
        if (!selectedSegmentId) return;
        setIsLoading(true);
        try {
            const task = await requestGenerateVoiceprintForSegment(personId, selectedSegmentId);

            setLatestPendingTask(task);
            setTasks(prev => [task, ...prev]);
            setIsManualOpen(false);
            setSelectedSegmentId(null);

            toast({
                title: "Voiceprint generation requested",
                description:
                    "Voiceprint generation from the selected segment is now processing. You can track progress in this dialog.",
            });
        } catch (error) {
            console.error("Error generating voiceprint from segment:", error);
            toast({
                title: "Error",
                description:
                    typeof error === "object" && error !== null && "message" in error
                        ? String(error.message)
                        : "Failed to generate voiceprint. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        try {
            await deleteTaskStatus(taskId);

            toast({
                title: "Task deleted",
                description: `Task ${taskId} has been successfully deleted.`,
            });

            // Refresh task statuses after deletion
            fetchTaskStatuses();
        } catch (error) {
            console.error("Error deleting task:", error);
            toast({
                title: "Error deleting task",
                description: error instanceof Error ? error.message : "An unknown error occurred",
                variant: "destructive",
            });
        }
    };

    const handlePlayAudio = () => {
        if (voicePrint?.sourceAudioUrl) {
            window.open(voicePrint.sourceAudioUrl, "_blank");
        }
    };

    const handleDeleteVoicePrint = async () => {
        if (!voicePrint) return;
        setIsLoading(true);
        try {
            await deleteVoicePrint(voicePrint.id);
            toast({
                title: "Voiceprint deleted",
                description: "The voiceprint has been successfully deleted.",
            });
        } catch (error) {
            console.error("Error deleting voiceprint:", error);
            toast({
                title: "Error",
                description:
                    typeof error === "object" && error !== null && "message" in error
                        ? String(error.message)
                        : "Failed to delete voiceprint. Please try again.",
                variant: "destructive",
            });
        }
    };

    const canGenerateVoiceprint = !voicePrint && !latestPendingTask;

    return (
        <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
                <Button variant='outline' size='sm' className={voicePrint ? "border-blue-300 text-blue-700" : ""}>
                    <Volume2 className='mr-2 h-4 w-4' />
                    Voiceprint
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Voiceprint Management</DialogTitle>
                    <DialogDescription>Manage voiceprint for {personName}</DialogDescription>
                </DialogHeader>

                <h4 className='text-lg font-semibold mb-4'>Task Runs</h4>
                <TaskList tasks={tasks} onDelete={handleDeleteTask} isLoading={isLoadingTasks} />

                <div className='space-y-4 my-4'>
                    <h4 className='text-lg font-semibold mb-4'>Voiceprint</h4>

                    {isLoading ? (
                        <div className='flex justify-center items-center py-6'>
                            <Loader2 className='h-8 w-8 animate-spin text-slate-400' />
                        </div>
                    ) : (
                        <>
                            {voicePrint ? (
                                // Has voiceprint - show details
                                <div className='text-sm space-y-2'>
                                    <p>
                                        <span className='font-medium'>Created:</span>{" "}
                                        {new Date(voicePrint.createdAt).toLocaleString()}
                                    </p>
                                    <p>
                                        <span className='font-medium'>Duration:</span>{" "}
                                        {Math.round((voicePrint.endTimestamp - voicePrint.startTimestamp) * 10) / 10}{" "}
                                        seconds
                                    </p>
                                </div>
                            ) : latestPendingTask ? (
                                <p className='text-sm text-slate-600'>
                                    Currently generating a voiceprint for this person. This may take a few minutes.
                                </p>
                            ) : (
                                <p className='text-sm text-slate-600'>
                                    No voiceprint has been created for this person yet. Generate a voiceprint to enable
                                    speaker identification.
                                </p>
                            )}

                            <div className='flex flex-col space-y-2 mt-4'>
                                {canGenerateVoiceprint && (
                                    <>
                                        <Button
                                            onClick={handleGenerateVoiceprint}
                                            disabled={isLoading}
                                            className='w-full'
                                        >
                                            <Volume2 className='mr-2 h-4 w-4' />
                                            Generate Voiceprint (auto-select)
                                        </Button>

                                        <Button
                                            variant='outline'
                                            onClick={handleToggleManual}
                                            disabled={isLoading}
                                            className='w-full justify-between'
                                        >
                                            <span className='flex items-center'>
                                                <ListMusic className='mr-2 h-4 w-4' />
                                                Choose segment manually
                                            </span>
                                            <ChevronDown
                                                className={cn(
                                                    "h-4 w-4 transition-transform",
                                                    isManualOpen && "rotate-180",
                                                )}
                                            />
                                        </Button>

                                        {isManualOpen && (
                                            <div className='space-y-2 rounded-md border p-3'>
                                                {isLoadingCandidates ? (
                                                    <div className='flex justify-center py-4'>
                                                        <Loader2 className='h-5 w-5 animate-spin text-slate-400' />
                                                    </div>
                                                ) : candidatesError ? (
                                                    <div className='space-y-2'>
                                                        <p className='text-sm text-slate-600'>
                                                            Could not load segments. Please try again.
                                                        </p>
                                                        <Button
                                                            variant='outline'
                                                            size='sm'
                                                            onClick={loadCandidates}
                                                            disabled={isLoadingCandidates}
                                                        >
                                                            Retry
                                                        </Button>
                                                    </div>
                                                ) : candidates.length === 0 ? (
                                                    <p className='text-sm text-slate-600'>
                                                        No segments of at least {VOICEPRINT_DURATION} seconds are available for this person.
                                                    </p>
                                                ) : (
                                                    <>
                                                        <p className='text-xs text-slate-500'>
                                                            Pick the segment with the clearest audio. A {VOICEPRINT_DURATION}-second window
                                                            centered on the segment will be used.
                                                        </p>
                                                        <ul className='max-h-[45vh] space-y-2 overflow-y-auto pr-1'>
                                                            {candidates.map(candidate => {
                                                                const isSelected =
                                                                    selectedSegmentId === candidate.segmentId;
                                                                return (
                                                                    <li key={candidate.segmentId}>
                                                                        <button
                                                                            type='button'
                                                                            onClick={() =>
                                                                                setSelectedSegmentId(candidate.segmentId)
                                                                            }
                                                                            className={cn(
                                                                                "w-full rounded-md border p-2 text-left text-sm transition-colors",
                                                                                isSelected
                                                                                    ? "border-blue-400 bg-blue-50"
                                                                                    : "hover:bg-slate-50",
                                                                            )}
                                                                        >
                                                                            <div className='flex items-center justify-between gap-2'>
                                                                                <span className='font-medium'>
                                                                                    {candidate.meetingName}
                                                                                </span>
                                                                                <span className='whitespace-nowrap text-xs text-slate-500'>
                                                                                    {formatDuration(candidate.duration)}
                                                                                </span>
                                                                            </div>
                                                                            <div className='text-xs text-slate-500'>
                                                                                {new Date(
                                                                                    candidate.meetingDate,
                                                                                ).toLocaleDateString()}{" "}
                                                                                ·{" "}
                                                                                {formatTimestamp(
                                                                                    candidate.startTimestamp,
                                                                                )}
                                                                            </div>
                                                                            {candidate.windowText && (
                                                                                <p className='mt-1 text-xs text-slate-600'>
                                                                                    {candidate.windowText}
                                                                                </p>
                                                                            )}
                                                                        </button>
                                                                        {candidate.mediaUrl && (
                                                                            <audio
                                                                                controls
                                                                                preload='none'
                                                                                src={`${candidate.mediaUrl}#t=${candidate.previewStartTimestamp},${candidate.previewEndTimestamp}`}
                                                                                className='mt-1 h-8 w-full'
                                                                                aria-label={`Audio preview for ${candidate.meetingName}`}
                                                                            >
                                                                                Your browser does not support audio playback.
                                                                            </audio>
                                                                        )}
                                                                        {candidate.fullText && (
                                                                            <details className='mt-1'>
                                                                                <summary className='cursor-pointer text-xs text-slate-500 hover:text-slate-700'>
                                                                                    Full segment transcript
                                                                                </summary>
                                                                                <p className='mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs text-slate-600'>
                                                                                    {candidate.fullText}
                                                                                </p>
                                                                            </details>
                                                                        )}
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                        <Button
                                                            onClick={handleGenerateFromSegment}
                                                            disabled={isLoading || !selectedSegmentId}
                                                            className='w-full'
                                                        >
                                                            <Volume2 className='mr-2 h-4 w-4' />
                                                            Generate from selected segment
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}

                                {voicePrint && (
                                    <Button
                                        variant='outline'
                                        onClick={handlePlayAudio}
                                        disabled={isLoading}
                                        className='w-full'
                                    >
                                        <Play className='mr-2 h-4 w-4' />
                                        Play Audio Sample
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className='flex justify-between'>
                    <div>
                        {voicePrint && (
                            <Button variant='destructive' onClick={handleDeleteVoicePrint} disabled={isLoading}>
                                <Trash className='mr-2 h-4 w-4' />
                                Delete Voiceprint
                            </Button>
                        )}
                    </div>
                    <Button variant='outline' onClick={() => handleDialogOpenChange(false)} disabled={isLoading}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
