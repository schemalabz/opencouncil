"use client"
import React, { useEffect } from 'react';
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
import PodcastSpecs from './PodcastSpecs';
import { toggleMeetingRelease } from '@/lib/db/meetings';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { requestProcessAgenda } from '@/lib/tasks/processAgenda';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import AddMeetingForm from '@/components/meetings/AddMeetingForm';
import { Pencil, Loader2, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { LinkOrDrop } from '@/components/ui/link-or-drop';
import { requestSyncElasticsearch } from '@/lib/tasks/syncElasticsearch';
import { MeetingExportButtons } from '../MeetingExportButtons';
import { CreateNotificationModal } from './CreateNotificationModal';

export default function AdminActions({
}: {
    }) {
    const { toast } = useToast();
    const { meeting, transcript, people, city, subjects } = useCouncilMeetingData();
    const [isTranscribing, setIsTranscribing] = React.useState(false);
    const [isSummarizing, setIsSummarizing] = React.useState(false);
    const [isProcessingAgenda, setIsProcessingAgenda] = React.useState(false);
    const [isSyncingElasticsearch, setIsSyncingElasticsearch] = React.useState(false);
    const [mediaUrl, setMediaUrl] = React.useState('');
    const [agendaUrl, setAgendaUrl] = React.useState(meeting.agendaUrl || '');
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [isSummarizePopoverOpen, setIsSummarizePopoverOpen] = React.useState(false);
    const [isAgendaPopoverOpen, setIsAgendaPopoverOpen] = React.useState(false);
    const [taskStatuses, setTaskStatuses] = React.useState<TaskStatus[]>([]);
    const [isLoadingTasks, setIsLoadingTasks] = React.useState(true);
    const [forceTranscribe, setForceTranscribe] = React.useState(false);
    const [topics, setTopics] = React.useState(['']);
    const [additionalInstructions, setAdditionalInstructions] = React.useState('');
    const [isReleased, setIsReleased] = React.useState(meeting.released);
    const [forceAgenda, setForceAgenda] = React.useState(false);
    const [isNotificationModalOpen, setIsNotificationModalOpen] = React.useState(false);
    const [notificationType, setNotificationType] = React.useState<'beforeMeeting' | 'afterMeeting'>('beforeMeeting');
    React.useEffect(() => {
        setMediaUrl(meeting.youtubeUrl || '');
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
            await requestTranscribe(mediaUrl, meeting.id, meeting.cityId, { force: forceTranscribe });
            toast({
                title: "Transcription requested",
                description: "The transcription process has started.",
            });
            setIsPopoverOpen(false);
            setMediaUrl('');
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

    const getMeetingData = () => ({
        city,
        meeting,
        transcript,
        people
    });


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

    const handleSyncElasticsearch = async () => {
        setIsSyncingElasticsearch(true);
        try {
            // PostgreSQL connector supports only full sync, so we use that
            await requestSyncElasticsearch(meeting.cityId, meeting.id, 'full');
            toast({
                title: "Elasticsearch sync requested",
                description: `The full sync process has started.`,
            });
        } catch (error) {
            toast({
                title: "Error requesting Elasticsearch sync",
                description: `${error}`,
                variant: 'destructive'
            });
        } finally {
            setIsSyncingElasticsearch(false);
        }
    };

    const handleCreateNotifications = async (
        type: 'beforeMeeting' | 'afterMeeting',
        subjectImportances: Record<string, { topicImportance: string; proximityImportance: string }>,
        sendImmediately: boolean
    ) => {
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/notifications`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type,
                    sendImmediately,
                    subjectImportances
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to create notifications');
            }

            const result = await response.json();

            toast({
                title: "Notifications created",
                description: `Created ${result.notificationsCreated} notifications for ${result.subjectsTotal} subjects. ${sendImmediately ? 'Sent immediately.' : 'Pending admin approval.'}`,
            });

            setIsNotificationModalOpen(false);
        } catch (error) {
            toast({
                title: "Error creating notifications",
                description: `${error}`,
                variant: 'destructive'
            });
        }
    };

    return (<div>
        <div className="mt-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Meeting Details</h3>
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="outline" size="sm">
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit Meeting
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="sm:max-w-2xl overflow-y-auto">
                        <SheetHeader>
                            <SheetTitle>Edit Meeting</SheetTitle>
                        </SheetHeader>
                        <div className="mt-4 pb-8">
                            <AddMeetingForm
                                cityId={meeting.cityId}
                                meeting={meeting}
                                onSuccess={() => {
                                    // Refresh the page to show updated data
                                    window.location.reload();
                                }}
                            />
                        </div>
                    </SheetContent>
                </Sheet>
            </div>
        </div>

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
                            <h4 className="font-medium">Enter Media URL</h4>
                            <LinkOrDrop
                                placeholder="https://... (YouTube, mp4, mp3)"
                                value={mediaUrl}
                                onChange={(e) => setMediaUrl(e.target.value)}
                                onUrlChange={(url) => setMediaUrl(url)}
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
                            <LinkOrDrop
                                placeholder="https://..."
                                value={agendaUrl}
                                onChange={(e) => setAgendaUrl(e.target.value)}
                                onUrlChange={(url) => setAgendaUrl(url)}
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
                <Button onClick={handleSyncElasticsearch} disabled={isSyncingElasticsearch}>
                    {isSyncingElasticsearch ? 'Syncing...' : 'Sync Elasticsearch'}
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
            <h3 className="text-lg font-semibold mb-4">Notifications</h3>
            <p className="text-sm text-gray-600 mb-4">
                Create notifications for users interested in this meeting&apos;s subjects.
            </p>
            <div className="flex gap-2">
                <Button
                    onClick={() => {
                        setNotificationType('beforeMeeting');
                        setIsNotificationModalOpen(true);
                    }}
                >
                    <Bell className="mr-2 h-4 w-4" />
                    Before Meeting
                </Button>
                <Button
                    variant="outline"
                    onClick={() => {
                        setNotificationType('afterMeeting');
                        setIsNotificationModalOpen(true);
                    }}
                >
                    <Bell className="mr-2 h-4 w-4" />
                    After Meeting
                </Button>
            </div>

            <CreateNotificationModal
                open={isNotificationModalOpen}
                onOpenChange={setIsNotificationModalOpen}
                subjects={subjects}
                notificationType={notificationType}
                onCreateNotifications={handleCreateNotifications}
            />
        </div>

        <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Cache Management</h3>
            <div className="flex space-x-3">
                <Button
                    onClick={async () => {
                        try {
                            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/revalidate`, {
                                method: 'POST',
                            });
                            if (response.ok) {
                                toast({
                                    title: "Meeting Cache Invalidated",
                                    description: "The meeting data will be refreshed on the next request.",
                                });
                            } else {
                                throw new Error('Failed to invalidate meeting cache');
                            }
                        } catch (error) {
                            toast({
                                title: "Error",
                                description: "Failed to invalidate meeting cache",
                                variant: "destructive"
                            });
                        }
                    }}
                >
                    Refresh Meeting Cache
                </Button>

                <Button
                    variant="outline"
                    onClick={async () => {
                        try {
                            const response = await fetch(`/api/cities/${meeting.cityId}/revalidate`, {
                                method: 'POST',
                            });
                            if (response.ok) {
                                toast({
                                    title: "City Cache Invalidated",
                                    description: "The city data will be refreshed on the next request.",
                                });
                            } else {
                                const data = await response.json();
                                throw new Error(data.error || 'Failed to invalidate city cache');
                            }
                        } catch (error) {
                            toast({
                                title: "Error",
                                description: error instanceof Error ? error.message : "Failed to invalidate city cache",
                                variant: "destructive"
                            });
                        }
                    }}
                >
                    Refresh City Cache
                </Button>
            </div>
        </div>

        <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Podcast Specs</h3>
            <PodcastSpecs />
        </div>

        <div className="mt-6">

            <h3 className="text-lg font-semibold mb-4">Export</h3>

            <MeetingExportButtons
                getMeetingData={getMeetingData}
                cityId={city.id}
                meetingId={meeting.id}
            />

        </div>
    </div>
    );
};
