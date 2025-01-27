"use client"
import React from 'react';
import { CouncilMeeting, TaskStatus } from '@prisma/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { requestTranscribe } from '@/lib/tasks/transcribe';
import { requestSummarize } from '@/lib/tasks/summarize';
import { requestFixTranscript } from '@/lib/tasks/fixTranscript';
import TaskList from './TaskList';
import { getTasksForMeeting } from '@/lib/db/tasks';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { embedCouncilMeeting } from '@/lib/search/embed';
import PodcastSpecs from './PodcastSpecs';
import { toggleMeetingRelease } from '@/lib/db/meetings';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { requestProcessAgenda } from '@/lib/tasks/processAgenda';

export default function AdminActions({
}: {
    }) {
    const { toast } = useToast();
    const { meeting } = useCouncilMeetingData();
    const [isTranscribing, setIsTranscribing] = React.useState(false);
    const [isSummarizing, setIsSummarizing] = React.useState(false);
    const [isProcessingAgenda, setIsProcessingAgenda] = React.useState(false);
    const [youtubeUrl, setYoutubeUrl] = React.useState('');
    const [agendaUrl, setAgendaUrl] = React.useState(meeting.agendaUrl || '');
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [isSummarizePopoverOpen, setIsSummarizePopoverOpen] = React.useState(false);
    const [isAgendaPopoverOpen, setIsAgendaPopoverOpen] = React.useState(false);
    const [taskStatuses, setTaskStatuses] = React.useState<TaskStatus[]>([]);
    const [isLoadingTasks, setIsLoadingTasks] = React.useState(true);
    const [forceTranscribe, setForceTranscribe] = React.useState(false);
    const [topics, setTopics] = React.useState(['']);
    const [additionalInstructions, setAdditionalInstructions] = React.useState('');
    const [isEmbedding, setIsEmbedding] = React.useState(false);
    const [isReleased, setIsReleased] = React.useState(meeting.released);
    const [forceAgenda, setForceAgenda] = React.useState(false);
    React.useEffect(() => {
        setYoutubeUrl(meeting.youtubeUrl || '');
    }, [meeting.youtubeUrl]);

    const fetchTaskStatuses = React.useCallback(async () => {
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
    }, [meeting.cityId, meeting.id, toast]);

    React.useEffect(() => {
        fetchTaskStatuses();
        const intervalId = setInterval(fetchTaskStatuses, 3000);
        return () => clearInterval(intervalId);
    }, [fetchTaskStatuses]);

    const handleTranscribe = async () => {
        setIsTranscribing(true);
        try {
            await requestTranscribe(youtubeUrl, meeting.id, meeting.cityId, { force: forceTranscribe });
            toast({
                title: "Transcription requested",
                description: "The transcription process has started.",
            });
            setIsPopoverOpen(false);
            setYoutubeUrl('');
        } catch (error) {
            console.log('toasting');
            toast({
                title: "Error requesting transcription",
                description: `${error}`,
                variant: 'destructive'
            });
        } finally {
            setIsTranscribing(false);
        }
    };

    const handleSummarize = async () => {
        setIsSummarizing(true);
        try {
            await requestSummarize(meeting.cityId, meeting.id, topics.filter(t => t.trim() !== ''), additionalInstructions);
            toast({
                title: "Summarization requested",
                description: "The summarization process has started.",
            });
            setIsSummarizePopoverOpen(false);
            setTopics(['']);
            setAdditionalInstructions('');
        } catch (error) {
            console.log('toasting');
            toast({
                title: "Error requesting summarization",
                description: `${error}`,
                variant: 'destructive'
            });
        } finally {
            setIsSummarizing(false);
        }
    };

    const handleFixTranscript = async () => {
        try {
            await requestFixTranscript(meeting.id, meeting.cityId);
            toast({
                title: "Fix transcript requested",
                description: "The transcript fixing process has started.",
            });
        } catch (error) {
            toast({
                title: "Error requesting transcript fix",
                description: `${error}`,
                variant: 'destructive'
            });
        }
    };

    const handleEmbed = async () => {
        setIsEmbedding(true);
        await embedCouncilMeeting(meeting.cityId, meeting.id);
        setIsEmbedding(false);
    }

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

    const handleTopicChange = (index: number, value: string) => {
        const newTopics = [...topics];
        newTopics[index] = value;
        setTopics(newTopics);
    };

    const addTopic = () => {
        setTopics([...topics, '']);
    };

    const handleReleaseToggle = async () => {
        try {
            const updatedMeeting = await toggleMeetingRelease(meeting.cityId, meeting.id, !isReleased);
            setIsReleased(updatedMeeting.released);
            toast({
                title: updatedMeeting.released ? "Meeting Released" : "Meeting Unreleased",
                description: `The meeting has been ${updatedMeeting.released ? 'released' : 'unreleased'}.`,
            });
        } catch (error) {
            console.error('Error toggling meeting release:', error);
            toast({
                title: "Error toggling meeting release",
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive'
            });
        }
    };

    const handleProcessAgenda = async (force: boolean = false) => {
        setIsProcessingAgenda(true);
        try {
            await requestProcessAgenda(agendaUrl, meeting.id, meeting.cityId, { force });
            toast({
                title: "Agenda processing requested",
                description: "The agenda processing has started.",
            });
            setIsAgendaPopoverOpen(false);
        } catch (error) {
            toast({
                title: "Error processing agenda",
                description: `${error}`,
                variant: 'destructive'
            });
        } finally {
            setIsProcessingAgenda(false);
        }
    };

    return (<div>
        <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Task Statuses</h3>
            <TaskList tasks={taskStatuses} onDelete={handleDeleteTask} isLoading={isLoadingTasks} />
        </div>
        <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Request New Tasks</h3>
            <div className="space-x-4">
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button>Transcribe</Button>
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
                                    <Label htmlFor="force-transcribe">Force</Label>
                                </div>
                                <Button onClick={handleTranscribe} disabled={isTranscribing}>
                                    {isTranscribing ? 'Starting...' : 'Transcribe'}
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
                <Popover open={isAgendaPopoverOpen} onOpenChange={setIsAgendaPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button>Process Agenda</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                        <div className="space-y-4">
                            <h4 className="font-medium">Enter Agenda URL</h4>
                            <Input
                                type="text"
                                placeholder="https://..."
                                value={agendaUrl}
                                onChange={(e) => setAgendaUrl(e.target.value)}
                            />
                            <div className="flex items-center justify-between space-x-2 w-full">
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="force-agenda"
                                        checked={forceAgenda}
                                        onCheckedChange={setForceAgenda}
                                    />
                                    <Label htmlFor="force-agenda">Force</Label>
                                </div>
                                <Button onClick={() => handleProcessAgenda(forceAgenda)} disabled={isProcessingAgenda}>
                                    {isProcessingAgenda ? 'Starting...' : 'Process'}
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
                <Popover open={isSummarizePopoverOpen} onOpenChange={setIsSummarizePopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button>Summarize</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                        <div className="space-y-4">
                            <h4 className="font-medium">Enter Topics</h4>
                            {topics.map((topic, index) => (
                                <Input
                                    key={index}
                                    type="text"
                                    placeholder={`Topic ${index + 1}`}
                                    value={topic}
                                    onChange={(e) => handleTopicChange(index, e.target.value)}
                                />
                            ))}
                            <Input
                                type="text"
                                placeholder="Additional Instructions"
                                value={additionalInstructions}
                                onChange={(e) => setAdditionalInstructions(e.target.value)}
                            />
                            <div className="flex items-center justify-between space-x-4 w-full">
                                <Button onClick={addTopic}>
                                    Add Topic
                                </Button>
                                <Button onClick={handleSummarize} disabled={isSummarizing}>
                                    {isSummarizing ? 'Starting...' : 'Summarize'}
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
                <Button onClick={handleFixTranscript}>
                    Fix Transcript
                </Button>
                <Button onClick={handleEmbed} disabled={isEmbedding}>
                    Embed
                </Button>
            </div>
        </div>
        <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Meeting Release</h3>
            <div className="flex items-center space-x-2">
                <Switch
                    id="release-toggle"
                    checked={isReleased}
                    onCheckedChange={handleReleaseToggle}
                />
                <Label htmlFor="release-toggle">Released</Label>
            </div>
        </div>
        <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Cache Management</h3>
            <Button
                onClick={async () => {
                    try {
                        const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/revalidate`, {
                            method: 'POST',
                        });
                        if (response.ok) {
                            toast({
                                title: "Cache Invalidated",
                                description: "The meeting data will be refreshed on the next request.",
                            });
                        } else {
                            throw new Error('Failed to invalidate cache');
                        }
                    } catch (error) {
                        toast({
                            title: "Error",
                            description: "Failed to invalidate cache",
                            variant: "destructive"
                        });
                    }
                }}
            >
                Refresh Cache
            </Button>
        </div>
        <PodcastSpecs />
    </div>
    );
};
