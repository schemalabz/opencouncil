"use client";

import { ChevronDown, History } from "lucide-react";
import { useTranslations } from "next-intl";
import { captureEvent } from "@/lib/analytics/capture";
import { RELATED_SUBJECTS_ID } from "./RelatedSubjects";

/**
 * The recurrence strip's link: the count in a sentence, as a pill on the
 * title banner's gradient, in the white the agenda label there uses, so it
 * reads as a fact about the page rather than a button. It scrolls to the
 * related section. A hash link, so it works in the server HTML before any
 * script runs.
 */
export function RelatedRecurrenceLink({ subjectId, cityId, meetingId, count }: {
    subjectId: string;
    cityId: string;
    meetingId: string;
    count: number;
}) {
    const t = useTranslations("Subject");
    return (
        <a
            href={`#${RELATED_SUBJECTS_ID}`}
            onClick={() => captureEvent('subject_action', {
                action: 'open_related_recurrence',
                subject_id: subjectId,
                city_id: cityId,
                meeting_id: meetingId,
                count,
            })}
            className="mt-3.5 inline-flex h-8 items-center gap-2 rounded-full border border-white/40 bg-white/15 pl-3 pr-3.5 text-[13px] font-medium text-white hover:bg-white/25 hover:no-underline"
        >
            <History className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--orange))]" aria-hidden />
            <span>{t("relatedRecurring", { count })}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/70" aria-hidden />
        </a>
    );
}
