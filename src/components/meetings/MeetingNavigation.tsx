"use client";

import { Link } from '@/i18n/routing';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate } from 'date-fns';
import { el, enUS } from 'date-fns/locale';
import { useLocale } from 'next-intl';

interface AdjacentMeetingInfo {
    id: string;
    dateTime: string; // ISO string (serialized from server)
}

interface MeetingNavigationProps {
    cityId: string;
    previous: AdjacentMeetingInfo | null;
    next: AdjacentMeetingInfo | null;
    meetingDescription: string;
}

/**
 * Renders previous/next navigation arrows flanking the meeting description
 * (date + subject count). Allows users to browse chronological sessions of
 * the same administrative body without returning to the meetings list.
 */
export default function MeetingNavigation({ cityId, previous, next, meetingDescription }: MeetingNavigationProps) {
    const locale = useLocale();

    const formatNavDate = (isoDate: string) => {
        return formatDate(new Date(isoDate), 'd MMM yyyy', {
            locale: locale === 'el' ? el : enUS,
        });
    };

    return (
        <span className="flex items-center gap-1">
            {previous ? (
                <Link
                    href={`/${cityId}/${previous.id}`}
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-accent transition-colors shrink-0"
                    title={formatNavDate(previous.dateTime)}
                >
                    <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
            ) : (
                <span className="inline-flex items-center justify-center w-5 h-5 shrink-0">
                    <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground/30" />
                </span>
            )}

            <span className="truncate">{meetingDescription}</span>

            {next ? (
                <Link
                    href={`/${cityId}/${next.id}`}
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-accent transition-colors shrink-0"
                    title={formatNavDate(next.dateTime)}
                >
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
            ) : (
                <span className="inline-flex items-center justify-center w-5 h-5 shrink-0">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30" />
                </span>
            )}
        </span>
    );
}
