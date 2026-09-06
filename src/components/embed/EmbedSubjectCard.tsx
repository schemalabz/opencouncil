import { formatDate } from '@/lib/formatters/time';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { getLocalizedName } from '@/lib/formatters/name';
import { getAgendaLabel } from '@/lib/utils/subjects';
import { CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';
import { SubjectCardContent } from '@/components/subject/SubjectCardContent';
import { SubjectCardFooter } from '@/components/subject/SubjectCardFooter';
import type { SubjectCardStats } from '@/lib/subjectCardStats';
import type { PersonWithRelations } from '@/lib/db/people';
import { embedLocalePrefix } from '@/lib/utils/embedParams';
import { localizeText } from '@/lib/serbian';
import { useTranslations } from 'next-intl';

type EmbedSubject = CouncilMeetingWithAdminBodyAndSubjects['subjects'][number];

interface EmbedSubjectCardProps {
    subject: EmbedSubject;
    meeting: CouncilMeetingWithAdminBodyAndSubjects;
    /** Subject location text; "Χωρίς τοποθεσία" fallback applied here. */
    locationText: string | null;
    /** Introducer + top speakers for the avatar row. */
    speakers: PersonWithRelations[];
    /** Footer stats (minutes / speaker count / party dots). */
    stats: SubjectCardStats;
    locale: string;
    baseUrl: string;
    cityTimezone?: string;
}

/**
 * Subjects-widget card. Renders the shared {@link SubjectCardContent} (same look
 * as the app's SubjectCard) wrapped in a plain new-tab link. The only client
 * island is the (static) speaker avatar row — no router, prefetch, or video —
 * so the iframe stays light.
 */
export function EmbedSubjectCard({ subject, meeting, locationText, speakers, stats, locale, baseUrl, cityTimezone }: EmbedSubjectCardProps) {
    const t = useTranslations('Subject');
    const subjectUrl = `${baseUrl}${embedLocalePrefix(locale)}/${meeting.cityId}/${meeting.id}/subjects/${subject.id}`;

    return (
        <a href={subjectUrl} target="_blank" rel="noopener noreferrer" className="block hover:no-underline">
            <SubjectCardContent
                title={localizeText(subject.name, locale)}
                topic={subject.topic}
                context={{ meta: formatDate(meeting.dateTime, cityTimezone, locale), meetingName: getLocalizedName(meeting, locale) }}
                locationText={locationText ? localizeText(locationText, locale) : t('noLocation')}
                agendaLabel={getAgendaLabel(t, subject)}
                description={subject.description ? localizeText(stripMarkdown(subject.description), locale) : null}
                footer={<SubjectCardFooter stats={stats} speakers={speakers} minutesText={t('minutesCount', { count: stats.minutes })} />}
                disableHover
                compact
            />
        </a>
    );
}
