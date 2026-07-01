import { formatDate } from '@/lib/formatters/time';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { getAgendaLabel } from '@/lib/utils/subjects';
import { CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';
import { SubjectCardContent } from '@/components/subject/SubjectCardContent';
import { SubjectCardFooter } from '@/components/subject/SubjectCardFooter';
import type { SubjectCardStats } from '@/lib/subjectCardStats';
import type { PersonWithRelations } from '@/lib/db/people';
import { routing } from '@/i18n/routing';
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

function localize<T extends { name: string; name_en: string }>(obj: T, locale: string): string {
    return locale === 'en' ? obj.name_en : obj.name;
}

/**
 * Subjects-widget card. Renders the shared {@link SubjectCardContent} (same look
 * as the app's SubjectCard) wrapped in a plain new-tab link. The only client
 * island is the (static) speaker avatar row — no router, prefetch, or video —
 * so the iframe stays light.
 */
export function EmbedSubjectCard({ subject, meeting, locationText, speakers, stats, locale, baseUrl, cityTimezone }: EmbedSubjectCardProps) {
    const t = useTranslations('Subject');
    // next-intl uses `as-needed` prefixing: the default locale has no prefix,
    // others do. Keeping the locale here makes English iframes link to English pages.
    const localePrefix = locale === routing.defaultLocale ? '' : `/${locale}`;
    const subjectUrl = `${baseUrl}${localePrefix}/${meeting.cityId}/${meeting.id}/subjects/${subject.id}`;

    return (
        <a href={subjectUrl} target="_blank" rel="noopener noreferrer" className="block hover:no-underline">
            <SubjectCardContent
                title={subject.name}
                topic={subject.topic}
                context={{ meta: formatDate(meeting.dateTime, cityTimezone, locale), meetingName: localize(meeting, locale) }}
                locationText={locationText || t('noLocation')}
                agendaLabel={getAgendaLabel(t, subject)}
                description={subject.description ? stripMarkdown(subject.description) : null}
                footer={<SubjectCardFooter stats={stats} speakers={speakers} />}
                disableHover
                compact
            />
        </a>
    );
}
