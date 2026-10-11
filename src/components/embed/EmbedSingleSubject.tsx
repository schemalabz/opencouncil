import { ArrowUpRight } from 'lucide-react';
import { SubjectCardContent } from '@/components/subject/SubjectCardContent';
import type { PublicSubject } from '@/lib/sharing/publicContent';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatDate } from '@/lib/formatters/time';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { localizeText } from '@/lib/serbian';
import { embedLocalePrefix } from '@/lib/utils/embedParams';

export function EmbedSingleSubject({ subject, locale, baseUrl, summaryLabel, readLabel }: { subject: PublicSubject; locale: string; baseUrl: string; summaryLabel: string; readLabel: string }) {
    const meeting = subject.councilMeeting;
    const url = `${baseUrl}${embedLocalePrefix(locale)}/${meeting.cityId}/${meeting.id}/subjects/${subject.id}`;
    const body = meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : null;
    return <article className="embed-single-subject">
        <SubjectCardContent title={<h1 className="embed-single-title">{localizeText(subject.name, locale)}</h1>} topic={subject.topic}
            context={{ meta: `${getLocalizedName(meeting.city, locale)} · ${formatDate(meeting.dateTime, meeting.city.timezone, locale)}`, meetingName: [body, getLocalizedName(meeting, locale)].filter(Boolean).join(' · ') }}
            locationText={subject.location ? localizeText(subject.location.text, locale) : null}
            description={subject.description ? localizeText(stripMarkdown(subject.description), locale) : null}
            mediaSlot={<p className="mb-2 text-xs text-muted-foreground">{summaryLabel}</p>}
            footer={<a href={url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 w-full items-center justify-between gap-2 border-t pt-3 text-sm font-semibold text-foreground hover:underline">{readLabel}<ArrowUpRight className="size-4 shrink-0" /></a>}
            disableHover />
    </article>;
}
