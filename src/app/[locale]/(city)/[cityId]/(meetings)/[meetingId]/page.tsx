"use client"
import MapView from "@/components/map/map";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { SubjectSection } from "@/components/meetings/subject-section";
import { TopicFilter } from "@/components/TopicFilter";
import { formatDate } from "date-fns";
import { AlertTriangleIcon, CalendarIcon, ExternalLink, FileIcon, FileText } from "lucide-react";
import { sortSubjectsBySpeakingTime, sortSubjectsByAgendaIndex, subjectToMapFeature } from "@/lib/utils";
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
    const beforeAgendaSubjects = useMemo(() =>
        sortSubjectsBySpeakingTime(filteredSubjects.filter(s => s.nonAgendaReason === 'beforeAgenda' && s.agendaItemIndex === null)),
        [filteredSubjects]
    );

    const outOfAgendaSubjects = useMemo(() =>
        sortSubjectsBySpeakingTime(filteredSubjects.filter(s => s.nonAgendaReason === 'outOfAgenda' && s.agendaItemIndex === null)),
        [filteredSubjects]
    );

    const agendaSubjects = useMemo(() => {
        const agenda = filteredSubjects.filter(s => s.agendaItemIndex !== null);
        return agendaSortMode === 'agendaIndex'
            ? sortSubjectsByAgendaIndex(agenda)
            : sortSubjectsBySpeakingTime(agenda);
    }, [filteredSubjects, agendaSortMode]);

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
                />
                <div className="absolute bottom-0 left-0 right-0 h-36 sm:h-48 bg-gradient-to-t from-white via-white/70 to-transparent" />
                <MeetingInfo />
            </div>

            <div className="p-4 sm:p-6">
                {
                    !meeting.youtubeUrl && meeting.agendaUrl && (
                        <div className="flex flex-col items-center justify-center max-w-2xl mx-auto mb-8 p-4 rounded-lg border bg-muted/50">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangleIcon className="w-5 h-5 text-yellow-500" />
                                <span className="font-medium">Αυτή η συνεδρίαση δεν έχει γίνει ακόμα.</span>
                            </div>
                            <div>
                                Μπορείτε <Link
                                    href={meeting.agendaUrl}
                                    target="_blank"
                                    className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors"
                                >
                                    να διαβάσετε την ημερήσια διάταξη εδώ
                                    <ExternalLink className="w-4 h-4" />
                                </Link>
                            </div>
                        </div>
                    )
                }
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
                            title="Προ ημερησίας, συζήτηση και ανακοινώσεις"
                            explainerText="Αυτά τα θέματα είναι ανακοινώσεις, ερωτήματα και συζήτηση για τα οποία δεν υπάρχει ψηφοφορία και δεν λαμβάνονται αποφάσεις, συνήθως στην αρχή της συνεδρίασης."
                            subjects={beforeAgendaSubjects}
                            className="flex-1 min-w-0"
                        />
                        <SubjectSection
                            title="Εκτός ημερησίας θέματα"
                            explainerText="Τα εκτός ημερησίας θέματα είναι έκτακτα θέματα που δεν πρόλαβαν να ενταχτούν στην ημερήσια διάταξη της συνεδρίασης. Ψηφίζονται από το σώμα, πρώτα για το κατ'επείγον, και έπειτα για την ουσία του θέματος."
                            subjects={outOfAgendaSubjects}
                            className="flex-1 min-w-0"
                        />
                    </div>
                )}

                {(beforeAgendaSubjects.length > 0 || outOfAgendaSubjects.length > 0) && agendaSubjects.length > 0 && (
                    <div className="max-w-4xl mx-auto mt-10"><hr className="border-border" /></div>
                )}

                <SubjectSection
                    title="Θέματα ημερησίας διάταξης"
                    explainerText="Τα θέματα της ημερησίας διάταξης συζητούνται και ψηφίζονται από το σώμα και αποτελούν το κύριο μέρος της συνεδρίασης."
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
