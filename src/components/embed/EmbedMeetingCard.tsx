import { CouncilMeeting, Subject, Topic, AdministrativeBody } from '@prisma/client';
import { sortSubjectsByImportance } from '@/lib/utils';
import { formatDate } from '@/lib/formatters/time';
import Icon from '@/components/icon';
import { CalendarIcon, Building, ChevronRight } from 'lucide-react';

type MeetingWithRelations = CouncilMeeting & {
    subjects: (Subject & { topic?: Topic | null; _count?: { contributions: number } })[];
    administrativeBody?: AdministrativeBody | null;
};

interface EmbedMeetingCardProps {
    meeting: MeetingWithRelations;
    locale: string;
    showSubjects: boolean;
    baseUrl: string;
    cityTimezone?: string;
    translations: EmbedTranslations;
}

export interface EmbedTranslations {
    subjects: string;
    more: string;
}

function localize<T extends { name: string; name_en: string }>(obj: T, locale: string): string {
    return locale === 'en' ? obj.name_en : obj.name;
}

export function EmbedMeetingCard({ meeting, locale, showSubjects, baseUrl, cityTimezone, translations: t }: EmbedMeetingCardProps) {
    const meetingUrl = `${baseUrl}/${meeting.cityId}/${meeting.id}`;
    const sortedSubjects = sortSubjectsByImportance(meeting.subjects, 'importance');
    const topSubjects = sortedSubjects.slice(0, 3);
    const remainingCount = Math.max(0, meeting.subjects.length - 3);

    return (
        <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ borderRadius: 'var(--embed-radius)' }}
            className="embed-card"
        >
            <div className="embed-card-title">
                {localize(meeting, locale)}
            </div>

            <div className="embed-card-meta">
                {meeting.administrativeBody && (
                    <span className="embed-card-meta-item">
                        <Building size={13} />
                        {localize(meeting.administrativeBody, locale)}
                    </span>
                )}
                <span className="embed-card-meta-item">
                    <CalendarIcon size={13} />
                    {formatDate(meeting.dateTime, cityTimezone, locale)}
                </span>
            </div>

            {showSubjects && topSubjects.length > 0 && (
                <div className="embed-card-subjects">
                    <div className="embed-subjects-label">{t.subjects}</div>
                    <ol className="embed-subjects-list">
                        {topSubjects.map((subject) => (
                            <li key={subject.id} className="embed-subject-item">
                                <div
                                    className="embed-subject-icon"
                                    style={{
                                        backgroundColor: subject.topic?.colorHex
                                            ? `${subject.topic.colorHex}20`
                                            : '#e5e7eb',
                                    }}
                                >
                                    <Icon
                                        name={subject.topic?.icon || 'Hash'}
                                        color={subject.topic?.colorHex || '#9ca3af'}
                                        size={14}
                                    />
                                </div>
                                <span>{subject.name}</span>
                            </li>
                        ))}
                    </ol>
                    {remainingCount > 0 && (
                        <span className="embed-card-more">
                            +{remainingCount} {t.more}
                            <ChevronRight size={12} />
                        </span>
                    )}
                </div>
            )}
        </a>
    );
}
