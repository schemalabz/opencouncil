"use client";
import Map from "@/components/map/map";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import TopicBadge from "../transcript/Topic";
import { useVideo } from "../VideoProvider";
import { Button } from "@/components/ui/button";
import { Play, FileText, MapPin, ScrollText, Clock } from "lucide-react";
import { PersonBadge } from "@/components/persons/PersonBadge";
import { Link } from "@/i18n/routing";
import { ColorPercentageRing } from "@/components/ui/color-percentage-ring";
import Icon from "@/components/icon";
import { subjectToMapFeature, getPartyFromRoles } from "@/lib/utils";
import { notFound } from "next/navigation";
import { SubjectContext } from "./context";
import { useMemo } from "react";

export default function Subject({ subjectId }: { subjectId?: string }) {
    const { subjects, getSpeakerTag, getPerson, getParty, meeting } = useCouncilMeetingData();
    const { seekToAndPlay } = useVideo();

    // If subjectId is provided, find the subject in the context
    const subject = subjectId ? subjects.find(s => s.id === subjectId) : undefined;

    // If no subject is found, return 404
    if (!subject) {
        notFound();
    }

    const { topic, location, description, name, speakerSegments, agendaItemIndex, introducedBy } = subject;

    const colorPercentages = subject.statistics?.parties?.map(p => ({
        color: p.item.colorHex,
        percentage: (p.speakingSeconds / subject.statistics!.speakingSeconds) * 100
    })) || [];

    const totalMinutes = Math.round(subject.statistics?.speakingSeconds ? subject.statistics.speakingSeconds / 60 : 0);

    // Memoize map features to prevent unnecessary recalculations
    const mapFeatures = useMemo(() => {
        if (!location) return [];
        const feature = subjectToMapFeature(subject);
        return feature ? [feature] : [];
    }, [subject, location]);

    return (
        <div className="min-h-screen bg-background">
            {/* Sticky Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
                <div className="max-w-4xl mx-auto px-3 py-3 md:px-4 md:py-4">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-full shrink-0" style={{ backgroundColor: topic?.colorHex ? topic.colorHex + "20" : "#e5e7eb" }}>
                            <Icon name={topic?.icon as any || "Hash"} color={topic?.colorHex || "#9ca3af"} size={16} />
                        </div>
                        <div className="flex-grow min-w-0">
                            <h1 className="text-lg font-semibold truncate">{name}</h1>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{totalMinutes} λεπτά</span>
                                {agendaItemIndex && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                                        <span>Θέμα #{agendaItemIndex}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-4xl mx-auto px-3 py-4 md:px-4 md:py-6 space-y-6">
                {/* Overview Section */}
                <div className="bg-card p-6 rounded-lg">
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Left Column - Color Ring */}
                        <div className="flex-shrink-0 flex items-center justify-center md:self-center">
                            <ColorPercentageRing
                                data={colorPercentages}
                                size={96}
                                thickness={12}
                            >
                                <div className="flex flex-col items-center">
                                    <div className="text-2xl font-medium">
                                        {totalMinutes}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        λεπτά
                                    </div>
                                </div>
                            </ColorPercentageRing>
                        </div>

                        {/* Right Column - Content */}
                        <div className="flex-grow min-w-0 space-y-4">
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    {topic && <TopicBadge topic={topic} />}
                                    {location && (
                                        <div className="inline-flex items-center gap-1.5 text-sm bg-muted/50 px-2.5 py-1 rounded-md">
                                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                                            <span className="truncate">{location.text}</span>
                                        </div>
                                    )}
                                </div>
                                {description && (
                                    <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                                )}
                            </div>

                            {introducedBy && (
                                <div className="pt-4 border-t">
                                    <div className="text-sm font-medium text-muted-foreground mb-2">Εισηγητής</div>
                                    <PersonBadge
                                        person={introducedBy}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Location Section */}
                {location && (
                    <div className="bg-card rounded-lg overflow-hidden">
                        <div className="p-4 border-b">
                            <h3 className="text-base font-semibold">Τοποθεσία</h3>
                            <p className="text-sm text-muted-foreground mt-1">{location.text}</p>
                        </div>
                        <div className="h-[300px] w-full">
                            <Map
                                center={location.coordinates ? [location.coordinates.y, location.coordinates.x] : undefined}
                                zoom={15}
                                features={mapFeatures}
                                animateRotation={false}
                            />
                        </div>
                    </div>
                )}

                {/* Context Section */}
                {subject.context && (
                    <SubjectContext subject={subject} />
                )}

                {/* Speaker Segments Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Τοποθετήσεις Ομιλητών</h3>
                        <div className="text-sm text-muted-foreground">
                            {speakerSegments?.length || 0} τοποθετήσεις
                        </div>
                    </div>

                    <div className="space-y-3">
                        {(!speakerSegments || speakerSegments.length === 0) ? (
                            <div className="bg-card rounded-lg p-8 text-center">
                                <p className="text-sm text-muted-foreground">Δεν υπάρχουν τοποθετήσεις ομιλητών</p>
                            </div>
                        ) : (
                            speakerSegments.map(segment => {
                                const speakerTag = getSpeakerTag(segment.speakerSegment.speakerTagId);
                                const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
                                const party = person ? getPartyFromRoles(person.roles) : null;
                                if (!speakerTag) return null;

                                const timeParam = `t=${Math.floor(segment.speakerSegment.startTimestamp)}`;
                                const transcriptUrl = `/${meeting.cityId}/${meeting.id}/transcript?${timeParam}`

                                return (
                                    <div
                                        key={segment.speakerSegmentId}
                                        className="group bg-card hover:bg-card/80 transition-colors rounded-lg border shadow-sm"
                                    >
                                        <div className="p-4">
                                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                                                <PersonBadge
                                                    person={person}
                                                    speakerTag={speakerTag}
                                                />
                                                <div className="flex gap-2 md:ml-auto">
                                                    <Button
                                                        onClick={() => seekToAndPlay(segment.speakerSegment.startTimestamp)}
                                                        variant="outline"
                                                        size="sm"
                                                        className="transition-colors hover:bg-primary hover:text-primary-foreground"
                                                    >
                                                        <Play className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        asChild
                                                        variant="outline"
                                                        size="sm"
                                                        className="transition-colors hover:bg-primary hover:text-primary-foreground"
                                                    >
                                                        <Link href={transcriptUrl}>
                                                            <FileText className="h-4 w-4 mr-1.5" />
                                                            Απομαγνητοφώνηση
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </div>
                                            {segment.summary ? (
                                                <div className="mt-4 pl-4 border-l-2 border-muted">
                                                    <p className="text-sm text-muted-foreground leading-relaxed">{segment.summary}</p>
                                                </div>
                                            ) : (
                                                <p className="text-center text-sm mt-6 text-muted-foreground italic">
                                                    Δεν υπάρχει αυτόματη σύνοψη για αυτή τη τοποθέτηση
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}