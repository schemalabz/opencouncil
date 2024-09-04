"use client"
import React from 'react';
import { CouncilMeeting, TaskStatus } from '@prisma/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { requestTranscribe } from '@/lib/tasks/transcribe';
import TaskList from './TaskList';
import { getTasksForMeeting } from '@/lib/db/getTasks';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function AdminActions({
    meeting
}: {
    meeting: CouncilMeeting
}) {
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [youtubeUrl, setYoutubeUrl] = React.useState('');
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [taskStatuses, setTaskStatuses] = React.useState<TaskStatus[]>([]);
    const [isLoadingTasks, setIsLoadingTasks] = React.useState(true);
    const [forceTranscribe, setForceTranscribe] = React.useState(false);

    React.useEffect(() => {
        setYoutubeUrl(meeting.youtubeUrl);
    }, [meeting.youtubeUrl]);

    const fetchTaskStatuses = async () => {
        try {
            const tasks = await getTasksForMeeting(meeting.cityId, meeting.id);
            setTaskStatuses(tasks);
        } catch (error) {
            console.error('Error fetching task statuses:', error);
            toast({
                title: "Error fetching task statuses",
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive'
            });
        } finally {
            setIsLoadingTasks(false);
        }
    };

    React.useEffect(() => {
        fetchTaskStatuses();
        const intervalId = setInterval(fetchTaskStatuses, 3000);
        return () => clearInterval(intervalId);
    }, [meeting.id, meeting.cityId]);

    const handleTranscribe = async () => {
        setIsProcessing(true);
        try {
            await requestTranscribe(youtubeUrl, meeting.id, meeting.cityId, { force: forceTranscribe });
            toast({
                title: "Transcription requested",
                description: "The transcription process has started.",
            });
            setIsPopoverOpen(false);
            setYoutubeUrl('');
        } catch (error) {
            toast({
                title: "Error requesting transcription",
                description: `${error}`,
                variant: 'destructive'
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/taskStatuses/${taskId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete task');
            }

            toast({
                title: "Task deleted",
                description: `Task ${taskId} has been successfully deleted.`,
            });

            // Refresh task statuses after deletion
            fetchTaskStatuses();
        } catch (error) {
            console.error('Error deleting task:', error);
            toast({
                title: "Error deleting task",
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive'
            });
        }
    };

    return (<div>
        <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Task Statuses</h3>
            <TaskList tasks={taskStatuses} onDelete={handleDeleteTask} isLoading={isLoadingTasks} />
        </div>
        <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Request New Transcription</h3>
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button>Request Transcription</Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                    <div className="space-y-4">
                        <h4 className="font-medium">Enter YouTube URL</h4>
                        <Input
                            type="text"
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={youtubeUrl}
                            onChange={(e) => setYoutubeUrl(e.target.value)}
                        />
                        <div className="flex items-center justify-between space-x-2 w-full">
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="force-transcribe"
                                    checked={forceTranscribe}
                                    onCheckedChange={setForceTranscribe}
                                />
                                <Label htmlFor="force-transcribe">Force </Label>
                            </div>
                            <Button onClick={handleTranscribe} disabled={isProcessing}>
                                {isProcessing ? 'Processing...' : 'Submit'}
                            </Button>
                        </div>

                    </div>
                </PopoverContent>
            </Popover>
        </div>
    </div>
    );
};
