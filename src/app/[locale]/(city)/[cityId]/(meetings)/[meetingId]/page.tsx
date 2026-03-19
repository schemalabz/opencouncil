"use client"
import MapView from "@/components/map/map";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { SubjectSection } from "@/components/meetings/subject-section";
import { TopicFilter } from "@/components/TopicFilter";
import { formatDate } from "date-fns";
import { CalendarIcon, ExternalLink, FileIcon, FileText, Youtube } from "lucide-react";
import { formatDateTime, formatRelativeTime } from "@/lib/formatters/time";
import { sortSubjectsBySpeakingTime, sortSubjectsByAgendaIndex, subjectToMapFeature } from "@/lib/utils";
import { categorizeSubjects, SUBJECT_CATEGORIES } from "@/lib/utils/subjects";
import { calculateGeometryBounds } from "@/lib/geo";
import { Link } from "@/i18n/routing";
import { HighlightCards } from "@/components/meetings/highlight-cards";
import { el } from "date-fns/locale";
import { enUS } from "date-fns/locale";
import { useLocale } from "next-intl";
import { useState, useMemo } from "react";
import type { Topic } from "@prisma/client";

export default function MeetingPage() {
    const { meeting, subjects, city } = useCouncilMeetingData();
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [agendaSortMode, setAgendaSortMode] = useState<'speakingTime' | 'agendaIndex'>('speakingTime');

    // Convert all subjects with locations to map features
    const subjectFeatures = subjects
        .map(subjectToMapFeature)
        .filter((f): f is NonNullable<ReturnType<typeof subjectToMapFeature>> => f !== null);

    // Center on city geometry for the decorative header map
    const cityCenter = useMemo((): [number, number] => {
        if (!city.geometry) return [23.7275, 37.9838];
        return calculateGeometryBounds(city.geometry).center;
    }, [city.geometry]);

    // Extract unique topics from all subjects
    const availableTopics = useMemo(() => {
        const topicsMap = new Map<string, Topic>();
        subjects.forEach(subject => {
            if (subject.topic) {
                topicsMap.set(subject.topic.id, subject.topic);
            }
        });
        return Array.from(topicsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [subjects]);

    // Filter by topic
    const filteredSubjects = useMemo(() => {
        if (!selectedTopicId) return subjects;
        return subjects.filter(s => s.topic?.id === selectedTopicId);
    }, [subjects, selectedTopicId]);

    // Categorize subjects
    const { beforeAgenda: beforeAgendaSubjects, outOfAgenda: outOfAgendaSubjects, agenda: categorizedAgenda } = useMemo(() =>
        categorizeSubjects(filteredSubjects),
        [filteredSubjects]
    );

    const agendaSubjects = useMemo(() =>
        agendaSortMode === 'agendaIndex'
            ? sortSubjectsByAgendaIndex(categorizedAgenda)
            : sortSubjectsBySpeakingTime(categorizedAgenda),
        [categorizedAgenda, agendaSortMode]
    );

    return (
        <div className="flex flex-col w-full">
            <div className="relative h-[200px] sm:h-[300px] w-full">
                <MapView className="w-full h-full" features={[
                    {
                        id: city.id,
                        geometry: city.geometry,
                        properties: {
                            name: city.name,
                            name_en: city.name_en
                        },
                        style: {
                            fillColor: '#627BBC',
                            fillOpacity: 0.2,
                            strokeColor: '#627BBC',
                            strokeWidth: 2,
                        }
                    },
                    ...subjectFeatures
                ]}
                    center={cityCenter}
                    zoom={12}
                />
                <div className="absolute bottom-0 left-0 right-0 h-36 sm:h-48 bg-gradient-to-t from-white via-white/70 to-transparent" />
                <MeetingInfo />
            </div>

            <div className="p-4 sm:p-6">
                <UpcomingMeetingCard />
                <HighlightCards subjects={subjects} />

                {availableTopics.length > 0 && (
                    <div className="max-w-4xl mx-auto mt-8">
                        <TopicFilter
                            topics={availableTopics}
                            selectedTopicId={selectedTopicId}
                            onSelectTopic={setSelectedTopicId}
                        />
                    </div>
                )}

                {(beforeAgendaSubjects.length > 0 || outOfAgendaSubjects.length > 0) && (
                    <div className={`max-w-4xl mx-auto ${beforeAgendaSubjects.length <= 1 && outOfAgendaSubjects.length <= 1 ? "flex flex-col lg:flex-row lg:flex-wrap gap-x-8" : "flex flex-col"}`}>
                        <SubjectSection
                            title={SUBJECT_CATEGORIES.beforeAgenda.label}
                            explainerText={SUBJECT_CATEGORIES.beforeAgenda.explainerText}
                            subjects={beforeAgendaSubjects}
                            className="flex-1 min-w-0"
                        />
                        <SubjectSection
                            title={SUBJECT_CATEGORIES.outOfAgenda.label}
                            explainerText={SUBJECT_CATEGORIES.outOfAgenda.explainerText}
                            subjects={outOfAgendaSubjects}
                            className="flex-1 min-w-0"
                        />
                    </div>
                )}

                {(beforeAgendaSubjects.length > 0 || outOfAgendaSubjects.length > 0) && agendaSubjects.length > 0 && (
                    <div className="max-w-4xl mx-auto mt-10"><hr className="border-border" /></div>
                )}

                <SubjectSection
                    title={SUBJECT_CATEGORIES.agenda.label}
                    explainerText={SUBJECT_CATEGORIES.agenda.explainerText}
                    subjects={agendaSubjects}
                    sortMode={agendaSortMode}
                    onSortModeChange={setAgendaSortMode}
                    showSortToggle
                />
            </div>
        </div>
    )
}

function MeetingInfo() {
    const { meeting, subjects } = useCouncilMeetingData();
    const locale = useLocale();
    return (
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
                <h1 className="text-xl sm:text-2xl font-bold">{meeting.name}</h1>
                <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm text-gray-600">
                    <div className="flex items-center">
                        <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2.5" />
                        {formatDate(new Date(meeting.dateTime), 'PPP', { locale: locale === 'el' ? el : enUS })}
                    </div>

                    {meeting.agendaUrl && (
                        <div className="flex items-center">
                            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2.5" />
                            <Link href={meeting.agendaUrl} target="_blank" className="hover:text-primary transition-colors inline-flex items-center">
                                Ημερήσια Διάταξη
                                <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-1.5" />
                            </Link>
                        </div>
                    )}

                    <div className="flex items-center">
                        <FileIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2.5" />
                        {subjects.length > 0 ? `${subjects.length} θέματα` : "Χωρίς θέματα"}
                    </div>
                </div>
            </div>
        </div>
    )
}

function UpcomingMeetingCard() {
    const { meeting, city } = useCouncilMeetingData();
    const locale = useLocale();

    if (meeting.youtubeUrl || (!meeting.agendaUrl && !meeting.administrativeBody?.youtubeChannelUrl)) {
        return null;
    }

    const meetingDate = new Date(meeting.dateTime);

    return (
        <div className="max-w-2xl mx-auto mb-8 p-6 sm:p-8 rounded-lg border bg-muted/50 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
                <CalendarIcon className="w-5 h-5 text-primary" />
                <p className="font-medium">
                    Η συνεδρίαση θα πραγματοποιηθεί {formatRelativeTime(meetingDate, locale)}
                </p>
            </div>
            <p className="text-lg font-semibold">
                {formatDateTime(meetingDate, city.timezone)}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
                {meeting.administrativeBody?.youtubeChannelUrl && (
                    <Link
                        href={meeting.administrativeBody.youtubeChannelUrl}
                        target="_blank"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border font-medium transition-colors hover:bg-accent"
                    >
                        <Youtube className="w-5 h-5 text-red-600" />
                        YouTube
                    </Link>
                )}
                {meeting.agendaUrl && (
                    <Link
                        href={meeting.agendaUrl}
                        target="_blank"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border font-medium transition-colors hover:bg-accent"
                    >
                        <FileText className="w-4 h-4" />
                        Ημερήσια Διάταξη
                    </Link>
                )}
            </div>
        </div>
    );
}
