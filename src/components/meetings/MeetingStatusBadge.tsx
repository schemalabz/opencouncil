"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ListChecks } from "lucide-react";
import { useTranslations } from "next-intl";
import { MeetingStage } from "@/lib/meetingStatus";

interface MeetingStatusBadgeProps {
    stage: MeetingStage;
}

export function MeetingStatusBadge({ stage }: MeetingStatusBadgeProps) {
    const ready = stage === 'ready';
    const t = useTranslations('MeetingStatus');

    return (
        <Badge variant={ready ? "default" : "secondary"} className="text-xs whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
                {ready ? <CheckCircle2 className="h-3 w-3" /> : <ListChecks className="h-3 w-3" />}
                {t(stage)}
            </span>
        </Badge>
    );
}


