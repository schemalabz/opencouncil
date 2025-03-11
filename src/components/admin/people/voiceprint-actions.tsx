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
import { useState, useEffect, useCallback } from "react";
import { Loader2, Play, Trash, Volume2 } from "lucide-react";
import { deleteVoicePrint } from "@/lib/db/voiceprints";
import { requestGenerateVoiceprint } from "@/lib/tasks/generateVoiceprint";
import { deleteTaskStatus, getVoiceprintTasksForPerson } from "@/lib/db/tasks";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import TaskList from "@/components/meetings/admin/TaskList";

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
    const { toast } = useToast();

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
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                                    <Button onClick={handleGenerateVoiceprint} disabled={isLoading} className='w-full'>
                                        <Volume2 className='mr-2 h-4 w-4' />
                                        Generate Voiceprint
                                    </Button>
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
                    <Button variant='outline' onClick={() => setIsDialogOpen(false)} disabled={isLoading}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
