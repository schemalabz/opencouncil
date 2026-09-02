"use client"
import MapView from "@/components/map/map";
import { captureEvent } from '@/lib/analytics/capture';
import { cityBoundaryFeature } from '@/components/map/cityBoundary';
import { TOPICLESS_COLOR } from '@/lib/topicStyle';
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { SubjectSection } from "@/components/meetings/subject-section";
import { TopicFilter } from "@/components/TopicFilter";
import { CalendarIcon, ExternalLink, FileIcon, FileText } from "lucide-react";
import { formatDate } from "@/lib/formatters/time";
import { pendingKind, type PublicMeetingStage } from "@/lib/meetingStage";
import { MeetingStageChip } from "@/components/meetings/stage/MeetingStageChip";
import { MeetingStageStrip } from "@/components/meetings/stage/MeetingStageStrip";
import { PendingSubjectsNote } from "@/components/meetings/stage/PendingSubjectsNote";
import { stageChipDetail } from "@/components/meetings/stage/stageDetail";
import { useMeetingStage } from "@/components/meetings/stage/useMeetingStage";
import { sortSubjectsBySpeakerContributionCount, sortSubjectsByAgendaIndex } from "@/lib/utils";
import { categorizeSubjects, getSubjectCategories } from "@/lib/utils/subjects";
import { calculateGeometryBounds } from "@/lib/geo";
import { Link } from "@/i18n/routing";
import { HighlightCards } from "@/components/meetings/highlight-cards";
import { useLocale, useTranslations } from "next-intl";
import { useState, useMemo } from "react";
import type { Topic } from "@prisma/client";

export default function MeetingPage() {
    const { meeting, subjects, city } = useCouncilMeetingData();
    const t = useTranslations("Subject");
    const subjectCategories = getSubjectCategories(t);
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [agendaSortMode, setAgendaSortMode] = useState<'speakingTime' | 'agendaIndex'>('speakingTime');
    const { stage, deadline, now } = useMeetingStage();
    // What a row says in place of the stats it does not have yet.
    const pending = pendingKind(stage);

    // The subjects as the shared map language's dense mode: plain topic-coloured
    // dots — what the landing draws when pins crowd. The band is decorative (a
    // gradient and the meeting info sit over it); the interactive map is the
    // Χάρτης tab.
    // Memoized: the map effect re-uploads its source whenever the array's
    // identity changes, and this component re-renders on every filter click.
    const mapFeatures = useMemo(() => [
        cityBoundaryFeature(city.id, city.geometry),
        ...subjects.flatMap(subject => {
            const point = subject.location?.coordinates;
            if (!point) return [];
            const color = subject.topic?.colorHex ?? TOPICLESS_COLOR;
            return [{
                id: `subject-${subject.id}`,
                geometry: { type: 'Point' as const, coordinates: [point.x, point.y] },
                properties: { interactive: false },
                style: { fillColor: color, fillOpacity: 0.85, strokeColor: color, strokeWidth: 5 },
            }];
        }),
    ], [city.id, city.geometry, subjects]);

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
            : sortSubjectsBySpeakerContributionCount(categorizedAgenda),
        [categorizedAgenda, agendaSortMode]
    );

    return (
        <div className="flex flex-col w-full">
            <div className="relative h-[200px] sm:h-[300px] w-full">
                <MapView className="w-full h-full" features={mapFeatures}
                    center={cityCenter}
                    zoom={12}
                />
                <div className="absolute bottom-0 left-0 right-0 h-36 sm:h-48 bg-gradient-to-t from-white via-white/70 to-transparent" />
                <MeetingInfo stage={stage} now={now} />
            </div>

            <div className="p-4 sm:p-6">
                <MeetingStageStrip stage={stage} deadline={deadline} />
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

                {stage === 'review' && !selectedTopicId && beforeAgendaSubjects.length === 0 && outOfAgendaSubjects.length === 0 && (
                    <PendingSubjectsNote deadline={deadline} />
                )}

                {(beforeAgendaSubjects.length > 0 || outOfAgendaSubjects.length > 0) && (
                    <div className={`max-w-4xl mx-auto ${beforeAgendaSubjects.length <= 1 && outOfAgendaSubjects.length <= 1 ? "flex flex-col lg:flex-row lg:flex-wrap gap-x-8" : "flex flex-col"}`}>
                        <SubjectSection
                            title={subjectCategories.beforeAgenda.label}
                            explainerText={subjectCategories.beforeAgenda.explainerText}
                            subjects={beforeAgendaSubjects}
                            pending={pending}
                            className="flex-1 min-w-0"
                        />
                        <SubjectSection
                            title={subjectCategories.outOfAgenda.label}
                            explainerText={subjectCategories.outOfAgenda.explainerText}
                            subjects={outOfAgendaSubjects}
                            pending={pending}
                            className="flex-1 min-w-0"
                        />
                    </div>
                )}

                {(beforeAgendaSubjects.length > 0 || outOfAgendaSubjects.length > 0) && agendaSubjects.length > 0 && (
                    <div className="max-w-4xl mx-auto mt-10"><hr className="border-border" /></div>
                )}

                <SubjectSection
                    title={subjectCategories.agenda.label}
                    explainerText={subjectCategories.agenda.explainerText}
                    subjects={agendaSubjects}
                    pending={pending}
                    sortMode={agendaSortMode}
                    onSortModeChange={setAgendaSortMode}
                    showSortToggle
                />
            </div>
        </div>
    )
}

function MeetingInfo({ stage, now }: { stage: PublicMeetingStage; now: Date }) {
    const tMeeting = useTranslations("CouncilMeeting");
    const tStage = useTranslations("meetingStage");
    const { meeting, subjects, city } = useCouncilMeetingData();
    const locale = useLocale();
    return (
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
                <h1 className="text-xl sm:text-2xl font-bold">{meeting.name}</h1>
                {/* The stage opens the facts row; on a phone the row wraps and the chip takes
                    the first slot. A complete meeting has no chip: the full ring is its absence. */}
                <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm text-gray-600">
                    {stage !== 'complete' && (
                        <MeetingStageChip
                            stage={stage}
                            detail={stageChipDetail(tStage, stage, meeting.dateTime, city.timezone, locale, now)}
                        />
                    )}
                    <div className="flex items-center">
                        <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2.5" />
                        {formatDate(new Date(meeting.dateTime), city.timezone, locale)}
                    </div>

                    {meeting.agendaUrl && (
                        <div className="flex items-center">
                            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2.5" />
                            <Link href={meeting.agendaUrl} target="_blank" onClick={() => captureEvent('meeting_page_action', { action: 'agenda_pdf', city_id: meeting.cityId, meeting_id: meeting.id })} className="hover:text-primary transition-colors inline-flex items-center">
                                {tMeeting('agendaDocument')}
                                <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-1.5" />
                            </Link>
                        </div>
                    )}

                    <div className="flex items-center">
                        <FileIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2.5" />
                        {tMeeting('subjectsCount', { count: subjects.length })}
                    </div>
                </div>
            </div>
        </div>
    )
}
