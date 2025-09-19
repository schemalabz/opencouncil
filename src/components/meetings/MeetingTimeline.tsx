"use client";

import { MeetingStatus } from "@/lib/meetingStatus";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface MeetingTimelineProps {
    meetingStatus: MeetingStatus;
}

export function MeetingTimeline({ meetingStatus }: MeetingTimelineProps) {
    const t = useTranslations('MeetingStatus');
    
    const taskSteps = [
        {
            key: 'processAgenda',
            label: t('agendaProcessed'),
            completed: meetingStatus.tasks.processAgenda,
            required: false, // Not required for meeting completion
        },
        {
            key: 'transcribe',
            label: t('transcribed'),
            completed: meetingStatus.tasks.transcribe,
            required: true,
        },
        {
            key: 'fixTranscript',
            label: t('transcriptFixed'),
            completed: meetingStatus.tasks.fixTranscript,
            required: true,
        },
        {
            key: 'humanReview',
            label: t('humanReviewed'),
            completed: meetingStatus.tasks.humanReview,
            required: true,
        },
        {
            key: 'summarize',
            label: t('summarized'),
            completed: meetingStatus.tasks.summarize,
            required: true,
        },
    ];

    return (
        <div className="space-y-2 min-w-[200px]">
            <div className="text-sm font-medium mb-3">Processing Timeline</div>
            {taskSteps.map((step, index) => (
                <div key={step.key} className="flex items-center gap-2">
                    <div className="flex-shrink-0">
                        {step.completed ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                            <Clock className="h-4 w-4 text-muted-foreground" />
                        )}
                    </div>
                    <div className="flex-1">
                        <div className={`text-sm ${step.completed ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {step.label}
                        </div>
                        {step.required && !step.completed && (
                            <div className="text-xs text-muted-foreground">
                                {t('requiredForCompletion')}
                            </div>
                        )}
                    </div>
                </div>
            ))}
            <div className="pt-2 border-t">
                <div className="flex items-center gap-2">
                    <div className="flex-shrink-0">
                        {meetingStatus.ready ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                    </div>
                    <div className="text-sm font-medium">
                        {meetingStatus.ready ? t('meetingReady') : t('notReady')}
                    </div>
                </div>
            </div>
        </div>
    );
}
