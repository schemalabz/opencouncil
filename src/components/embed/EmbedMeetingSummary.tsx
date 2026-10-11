import { ArrowRight, Clock, FileText, Users } from 'lucide-react';
import { formatDate } from '@/lib/formatters/time';
import { getLocalizedName } from '@/lib/formatters/name';
import { embedLocalePrefix } from '@/lib/utils/embedParams';
import { pickSummarySubjects } from '@/lib/utils/subjects';
import type { MeetingSummary } from '@/lib/db/types';
import { EmbedSummarySubjectCard } from '@/components/embed/EmbedSummarySubjectCard';

export interface EmbedSummaryTranslations {
    aiSummary: string;
    fullMeeting: string;
    noSubjects: string;
    subjectsCount: (count: number) => string;
    speakersCount: (count: number) => string;
    hoursCount: (count: number) => string;
    minutesCount: (count: number) => string;
}

interface EmbedMeetingSummaryProps {
    summary: MeetingSummary;
    /** Subject cards to show; the footer still counts every subject. */
    maxSubjects: number;
    locale: string;
    baseUrl: string;
    cityTimezone?: string;
    translations: EmbedSummaryTranslations;
}

/** "3 ώρες 41 λεπτά" — the hours part only from one hour on, the minutes part only when non-zero. */
function formatDurationText(seconds: number, t: EmbedSummaryTranslations): string {
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return t.minutesCount(minutes);
    if (minutes === 0) return t.hoursCount(hours);
    return `${t.hoursCount(hours)} ${t.minutesCount(minutes)}`;
}

/**
 * One meeting block of the summary widget: body and meeting in the header, the
 * most discussed subjects as cards, and a stats footer with the block's only
 * link to the meeting page. Hook-free, so the iframe stays a Server Component.
 */
export function EmbedMeetingSummary({ summary, maxSubjects, locale, baseUrl, cityTimezone, translations: t }: EmbedMeetingSummaryProps) {
    const { meeting, durationSeconds, speakerCount, subjectStartSeconds } = summary;
    const meetingUrl = `${baseUrl}${embedLocalePrefix(locale)}/${meeting.cityId}/${meeting.id}`;
    const subjects = pickSummarySubjects(meeting.subjects, maxSubjects);

    const meetingName = getLocalizedName(meeting, locale);
    // The cached payload revives dates as ISO strings; normalize before formatting.
    const date = formatDate(new Date(meeting.dateTime), cityTimezone, locale);
    const title = meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : meetingName;
    const subtitle = meeting.administrativeBody ? `${meetingName}, ${date}` : date;

    return (
        <section className="embed-summary" style={{ borderRadius: 'var(--embed-radius)' }}>
            <header className="embed-summary-header">
                <div>
                    <div className="embed-summary-title">{title}</div>
                    <div className="embed-summary-subtitle">{subtitle}</div>
                </div>
                <span className="embed-summary-badge">{t.aiSummary}</span>
            </header>

            {subjects.length > 0 ? (
                <div className="embed-summary-grid">
                    {subjects.map((subject) => (
                        <EmbedSummarySubjectCard
                            key={subject.id}
                            subject={subject}
                            startSeconds={subjectStartSeconds[subject.id] ?? null}
                            href={`${meetingUrl}/subjects/${subject.id}`}
                            locale={locale}
                        />
                    ))}
                </div>
            ) : (
                <div className="embed-empty">{t.noSubjects}</div>
            )}

            <footer className="embed-summary-footer">
                <div className="embed-summary-stats">
                    {durationSeconds != null && (
                        <span className="embed-summary-stat">
                            <Clock size={13} />
                            {formatDurationText(durationSeconds, t)}
                        </span>
                    )}
                    <span className="embed-summary-stat">
                        <FileText size={13} />
                        {t.subjectsCount(meeting.subjects.length)}
                    </span>
                    {speakerCount > 0 && (
                        <span className="embed-summary-stat">
                            <Users size={13} />
                            {t.speakersCount(speakerCount)}
                        </span>
                    )}
                </div>
                <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className="embed-summary-link">
                    {t.fullMeeting}
                    <ArrowRight size={14} />
                </a>
            </footer>
        </section>
    );
}
