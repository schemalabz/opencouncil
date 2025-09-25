"use client";

import { MeetingStatus, getTasks } from "@/lib/meetingStatus";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface MeetingTimelineProps {
    meetingStatus: MeetingStatus;
}

export function MeetingTimeline({ meetingStatus }: MeetingTimelineProps) {
    const t = useTranslations('MeetingStatus');
    
    // Derive tasks from centralized definitions
    const tasks = getTasks(meetingStatus.tasks, (key) => t(key));

    return (
        <div className="space-y-2 min-w-[200px]">
            <div className="text-sm font-medium mb-3">Processing Timeline</div>
            {tasks.map((task, index) => (
                <div key={task.key} className="flex items-center gap-2">
                    <div className="flex-shrink-0">
                        {task.completed ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                            <Clock className="h-4 w-4 text-muted-foreground" />
                        )}
                    </div>
                    <div className="flex-1">
                        <div className={`text-sm ${task.completed ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {task.label}
                        </div>
                        {task.required && !task.completed && (
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
                        {meetingStatus.ready ? t('ready') : t('notReady')}
                    </div>
                </div>
            </div>
        </div>
    );
}
