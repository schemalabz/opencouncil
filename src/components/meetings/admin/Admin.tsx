"use client"
import React from 'react';
import { TaskStatus } from '@prisma/client';
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
import { Pencil, Bell } from 'lucide-react';
import { LinkOrDrop } from '@/components/ui/link-or-drop';
import { MeetingExportButtons } from '../MeetingExportButtons';
import { CreateNotificationModal } from './CreateNotificationModal';
import { markHumanReviewComplete } from '@/lib/tasks/humanReview';
import { useTranslations } from 'next-intl';

export default function AdminActions({
}: {
    }) {
    const { toast } = useToast();
    const t = useTranslations('admin.adminActions');
    const { meeting, transcript, people, city, subjects } = useCouncilMeetingData();
    const [isTranscribing, setIsTranscribing] = React.useState(false);
    const [isSummarizing, setIsSummarizing] = React.useState(false);
    const [isProcessingAgenda, setIsProcessingAgenda] = React.useState(false);
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
                title: t('toasts.errorFetchingTaskStatuses.title'),
                description: error instanceof Error ? error.message : t('toasts.unknownError'),
                variant: 'destructive'
            });
        } finally {
            setIsLoadingTasks(false);
        }
    }, [meeting.cityId, meeting.id, toast, t]);

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
                title: t('toasts.transcriptionRequested.title'),
                description: t('toasts.transcriptionRequested.description'),
            });
            setIsPopoverOpen(false);
            setMediaUrl('');
        } catch (error) {
            console.log('toasting');
            toast({
                title: t('toasts.errorRequestingTranscription.title'),
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
                title: t('toasts.summarizationRequested.title'),
                description: t('toasts.summarizationRequested.description'),
            });
            setIsSummarizePopoverOpen(false);
            setTopics(['']);
            setAdditionalInstructions('');
        } catch (error) {
            console.log('toasting');
            toast({
                title: t('toasts.errorRequestingSummarization.title'),
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
                title: t('toasts.fixTranscriptRequested.title'),
                description: t('toasts.fixTranscriptRequested.description'),
            });
        } catch (error) {
            toast({
                title: t('toasts.errorRequestingTranscriptFix.title'),
                description: `${error}`,
                variant: 'destructive'
            });
        }
    };

    const handleMarkReviewComplete = async () => {
        try {
            await markHumanReviewComplete(meeting.cityId, meeting.id);
            toast({
                title: t('toasts.humanReviewComplete.title'),
                description: t('toasts.humanReviewComplete.description'),
            });
            fetchTaskStatuses();
        } catch (error) {
            toast({
                title: t('toasts.errorMarkingReviewComplete.title'),
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
                title: t('toasts.taskDeleted.title'),
                description: t('toasts.taskDeleted.description', { taskId }),
            });

            // Refresh task statuses after deletion
            fetchTaskStatuses();
        } catch (error) {
            console.error('Error deleting task:', error);
            toast({
                title: t('toasts.errorDeletingTask.title'),
                description: error instanceof Error ? error.message : t('toasts.unknownError'),
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
                title: updatedMeeting.released ? t('toasts.meetingReleased.title') : t('toasts.meetingUnreleased.title'),
                description: updatedMeeting.released ? t('toasts.meetingReleased.description') : t('toasts.meetingUnreleased.description'),
            });
        } catch (error) {
            console.error('Error toggling meeting release:', error);
            toast({
                title: t('toasts.errorTogglingRelease.title'),
                description: error instanceof Error ? error.message : t('toasts.unknownError'),
                variant: 'destructive'
            });
        }
    };

    const handleProcessAgenda = async (force: boolean = false) => {
        setIsProcessingAgenda(true);
        try {
            await requestProcessAgenda(agendaUrl, meeting.id, meeting.cityId, { force });
            toast({
                title: t('toasts.agendaProcessingRequested.title'),
                description: t('toasts.agendaProcessingRequested.description'),
            });
            setIsAgendaPopoverOpen(false);
        } catch (error) {
            toast({
                title: t('toasts.errorProcessingAgenda.title'),
                description: `${error}`,
                variant: 'destructive'
            });
        } finally {
            setIsProcessingAgenda(false);
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

            const immediateText = sendImmediately ? t('toasts.sentImmediately') : t('toasts.pendingApproval');
            toast({
                title: t('toasts.notificationsCreated.title'),
                description: t('toasts.notificationsCreated.description', { 
                    count: result.notificationsCreated, 
                    total: result.subjectsTotal,
                    immediate: immediateText
                }),
            });

            setIsNotificationModalOpen(false);
        } catch (error) {
            toast({
                title: t('toasts.errorCreatingNotifications.title'),
                description: `${error}`,
                variant: 'destructive'
            });
        }
    };

    return (<div>
        <div className="mt-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">{t('sections.meetingDetails')}</h3>
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="outline" size="sm">
                            <Pencil className="h-4 w-4 mr-2" />
                            {t('buttons.editMeeting')}
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="sm:max-w-2xl overflow-y-auto">
                        <SheetHeader>
                            <SheetTitle>{t('buttons.editMeeting')}</SheetTitle>
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
            <h3 className="text-lg font-semibold">{t('sections.taskStatuses')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('sections.taskStatusesSubtitle')}</p>
            <TaskList tasks={taskStatuses} onDelete={handleDeleteTask} isLoading={isLoadingTasks} />
        </div>
        <div className="mt-6">
            <h3 className="text-lg font-semibold">{t('sections.requestNewTasks')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('sections.requestNewTasksSubtitle')}</p>
            <div className="space-x-4">
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button>{t('buttons.transcribe')}</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                        <div className="space-y-4">
                            <h4 className="font-medium">{t('forms.enterMediaUrl')}</h4>
                            <LinkOrDrop
                                placeholder={t('forms.mediaUrlPlaceholder')}
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
                                    <Label htmlFor="force-transcribe">{t('forms.force')}</Label>
                                </div>
                                <Button onClick={handleTranscribe} disabled={isTranscribing}>
                                    {isTranscribing ? t('buttons.starting') : t('buttons.transcribe')}
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
                <Popover open={isAgendaPopoverOpen} onOpenChange={setIsAgendaPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button>{t('buttons.processAgenda')}</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                        <div className="space-y-4">
                            <h4 className="font-medium">{t('forms.enterAgendaUrl')}</h4>
                            <LinkOrDrop
                                placeholder={t('forms.agendaUrlPlaceholder')}
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
                                    <Label htmlFor="force-agenda">{t('forms.force')}</Label>
                                </div>
                                <Button onClick={() => handleProcessAgenda(forceAgenda)} disabled={isProcessingAgenda}>
                                    {isProcessingAgenda ? t('buttons.starting') : t('buttons.process')}
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
                <Popover open={isSummarizePopoverOpen} onOpenChange={setIsSummarizePopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button>{t('buttons.summarize')}</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                        <div className="space-y-4">
                            <h4 className="font-medium">{t('forms.enterTopics')}</h4>
                            {topics.map((topic, index) => (
                                <Input
                                    key={index}
                                    type="text"
                                    placeholder={t('forms.topicPlaceholder', { number: index + 1 })}
                                    value={topic}
                                    onChange={(e) => handleTopicChange(index, e.target.value)}
                                />
                            ))}
                            <Input
                                type="text"
                                placeholder={t('forms.additionalInstructions')}
                                value={additionalInstructions}
                                onChange={(e) => setAdditionalInstructions(e.target.value)}
                            />
                            <div className="flex items-center justify-between space-x-4 w-full">
                                <Button onClick={addTopic}>
                                    {t('buttons.addTopic')}
                                </Button>
                                <Button onClick={handleSummarize} disabled={isSummarizing}>
                                    {isSummarizing ? t('buttons.starting') : t('buttons.summarize')}
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
                <Button onClick={handleFixTranscript}>
                    {t('buttons.fixTranscript')}
                </Button>
                <Button variant="outline" onClick={handleMarkReviewComplete}>
                    {t('buttons.markHumanReviewComplete')}
                </Button>
            </div>
        </div>
        <div className="mt-6">
            <h3 className="text-lg font-semibold">{t('sections.meetingRelease')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('sections.meetingReleaseSubtitle')}</p>
            <div className="flex items-center space-x-2">
                <Switch
                    id="release-toggle"
                    checked={isReleased}
                    onCheckedChange={handleReleaseToggle}
                />
                <Label htmlFor="release-toggle">{t('forms.released')}</Label>
            </div>
        </div>

        <div className="mt-6">
            <h3 className="text-lg font-semibold">{t('sections.notifications')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
                {t('sections.notificationsSubtitle')}
            </p>
            <div className="flex gap-2">
                <Button
                    onClick={() => {
                        setNotificationType('beforeMeeting');
                        setIsNotificationModalOpen(true);
                    }}
                >
                    <Bell className="mr-2 h-4 w-4" />
                    {t('buttons.beforeMeeting')}
                </Button>
                <Button
                    variant="outline"
                    onClick={() => {
                        setNotificationType('afterMeeting');
                        setIsNotificationModalOpen(true);
                    }}
                >
                    <Bell className="mr-2 h-4 w-4" />
                    {t('buttons.afterMeeting')}
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
            <h3 className="text-lg font-semibold">{t('sections.cacheManagement')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('sections.cacheManagementSubtitle')}</p>
            <div className="flex space-x-3">
                <Button
                    onClick={async () => {
                        try {
                            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/revalidate`, {
                                method: 'POST',
                            });
                            if (response.ok) {
                                toast({
                                    title: t('toasts.meetingCacheInvalidated.title'),
                                    description: t('toasts.meetingCacheInvalidated.description'),
                                });
                            } else {
                                throw new Error(t('toasts.error.failedToInvalidateMeetingCache'));
                            }
                        } catch (error) {
                            toast({
                                title: t('toasts.error.title'),
                                description: t('toasts.error.failedToInvalidateMeetingCache'),
                                variant: "destructive"
                            });
                        }
                    }}
                >
                    {t('buttons.refreshMeetingCache')}
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
                                    title: t('toasts.cityCacheInvalidated.title'),
                                    description: t('toasts.cityCacheInvalidated.description'),
                                });
                            } else {
                                const data = await response.json();
                                throw new Error(data.error || t('toasts.error.failedToInvalidateCityCache'));
                            }
                        } catch (error) {
                            toast({
                                title: t('toasts.error.title'),
                                description: error instanceof Error ? error.message : t('toasts.error.failedToInvalidateCityCache'),
                                variant: "destructive"
                            });
                        }
                    }}
                >
                    {t('buttons.refreshCityCache')}
                </Button>
            </div>
        </div>

        <div className="mt-6">
            <h3 className="text-lg font-semibold">{t('sections.podcastSpecs')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('sections.podcastSpecsSubtitle')}</p>
            <PodcastSpecs />
        </div>

        <div className="mt-6">
            <h3 className="text-lg font-semibold">{t('sections.export')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('sections.exportSubtitle')}</p>

            <MeetingExportButtons
                getMeetingData={getMeetingData}
                cityId={city.id}
                meetingId={meeting.id}
            />

        </div>
    </div>
    );
};
