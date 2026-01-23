"use client";
import Map from "@/components/map/map";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import TopicBadge from "../transcript/Topic";
import { useVideo } from "../VideoProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, FileText, MapPin, ScrollText, Clock, ChevronDown } from "lucide-react";
import { PersonBadge } from "@/components/persons/PersonBadge";
import { Link } from "@/i18n/routing";
import { ColorPercentageRing } from "@/components/ui/color-percentage-ring";
import Icon from "@/components/icon";
import { subjectToMapFeature, getPartyFromRoles } from "@/lib/utils";
import { notFound } from "next/navigation";
import { SubjectContext } from "./context";
import { useMemo, useState } from "react";
import { FormattedTextDisplay } from "@/components/FormattedTextDisplay";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DebugUtterances } from "./DebugUtterances";
import { AIGeneratedBadge } from "@/components/AIGeneratedBadge";
import { AutoScrollText } from "@/components/ui/auto-scroll-text";

export default function Subject({ subjectId }: { subjectId?: string }) {
    const { subjects, getSpeakerTag, getPerson, getParty, meeting, transcript: allSpeakerSegments } = useCouncilMeetingData();
    const { seekToAndPlay } = useVideo();

    // If subjectId is provided, find the subject in the context
    const subject = subjectId ? subjects.find(s => s.id === subjectId) : undefined;

    // If no subject is found, return 404
    if (!subject) {
        notFound();
    }

    const {
        topic,
        location,
        description,
        name,
        speakerSegments,
        agendaItemIndex,
        introducedBy,
        contributions,
        topicImportance,
        proximityImportance
    } = subject;

    // Use contributions if available, fallback to speaker segments
    const hasContributions = contributions && contributions.length > 0;

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
                <div className="max-w-4xl mx-auto px-3 py-3.5 md:px-4 md:py-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-full shrink-0" style={{ backgroundColor: topic?.colorHex ? topic.colorHex + "20" : "#e5e7eb" }}>
                            <Icon name={topic?.icon as any || "Hash"} color={topic?.colorHex || "#9ca3af"} size={24} />
                        </div>
                        <div className="flex-grow min-w-0">
                            <AutoScrollText className="mb-1.5">
                                <h1 className="text-xl font-semibold leading-tight">{name}</h1>
                            </AutoScrollText>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {topic && <TopicBadge topic={topic} size="compact" />}
                                {agendaItemIndex && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                                        <span className="font-medium">Θέμα #{agendaItemIndex}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-4xl mx-auto px-3 py-4 md:px-4 md:py-6 space-y-6">
                {/* Quick Stats Bar */}
                <div className="bg-card rounded-lg p-4 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6">
                        {/* Parties Section */}
                        <div className="flex-grow min-w-0">
                            <h3 className="text-sm font-semibold mb-3">Παρατάξεις</h3>
                            <div className="flex items-start gap-4">
                                {/* Color Ring */}
                                <div className="flex-shrink-0">
                                    <ColorPercentageRing
                                        data={colorPercentages}
                                        size={80}
                                        thickness={10}
                                    >
                                        <div className="flex flex-col items-center">
                                            <div className="text-xl font-semibold">
                                                {totalMinutes}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                                λεπτά
                                            </div>
                                        </div>
                                    </ColorPercentageRing>
                                </div>

                                {/* Party Breakdown + Speaker Count */}
                                <div className="flex-grow min-w-0 space-y-3">
                                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                        {subject.statistics?.parties?.map((p) => (
                                            <div key={p.item.id} className="flex items-center gap-1.5 text-xs">
                                                <div
                                                    className="w-3 h-3 rounded-sm shrink-0"
                                                    style={{ backgroundColor: p.item.colorHex }}
                                                />
                                                <span className="font-medium">{p.item.name}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span>{subject.statistics?.people?.length || (hasContributions ? contributions.length : speakerSegments?.length || 0)} ομιλητές</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Introducer Section */}
                        {introducedBy && (
                            <div className="shrink-0">
                                <h3 className="text-sm font-semibold mb-3">Εισηγητής</h3>
                                <PersonBadge person={introducedBy} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Description Section */}
                {description && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-left">Σύνοψη</h2>
                        <div className="prose prose-sm max-w-none dark:prose-invert text-justify">
                            <FormattedTextDisplay
                                text={description}
                                meetingId={meeting.id}
                                cityId={meeting.cityId}
                                linkColor="black"
                            />
                        </div>
                        <div className="flex justify-end">
                            <AIGeneratedBadge />
                        </div>

                        {/* Inline Metadata */}
                        {location && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground pt-2">
                                <MapPin className="w-3.5 h-3.5 shrink-0" />
                                <span>{location.text}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Context Section */}
                {subject.context && (
                    <SubjectContext subject={subject} />
                )}

                {/* Speaker Contributions OR Speaker Segments */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">
                            Τοποθετήσεις
                        </h3>
                        <div className="text-sm text-muted-foreground">
                            {hasContributions
                                ? `${contributions.length} τοποθετήσεις`
                                : `${speakerSegments?.length || 0} τοποθετήσεις`
                            }
                        </div>
                    </div>

                    {hasContributions ? (
                        /* NEW: Render Contributions */
                        <div className="space-y-3">
                            {contributions.length === 0 ? (
                                <div className="bg-card rounded-lg p-8 text-center border">
                                    <p className="text-sm text-muted-foreground">
                                        Δεν υπάρχουν συνεισφορές ομιλητών
                                    </p>
                                </div>
                            ) : (
                                contributions.map(contribution => {
                                    const speaker = contribution.speakerId
                                        ? getPerson(contribution.speakerId)
                                        : null;

                                    return (
                                        <div
                                            key={contribution.id}
                                            className="group bg-card rounded-lg border shadow-sm"
                                        >
                                            <div className="p-4 space-y-4">
                                                {/* Speaker Badge */}
                                                <div className="flex items-center gap-4">
                                                    {speaker ? (
                                                        <PersonBadge
                                                            person={speaker}
                                                        />
                                                    ) : (
                                                        <span className="text-sm text-muted-foreground italic">
                                                            Άγνωστος ομιλητής
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Formatted Text with References */}
                                                <div className="text-sm text-muted-foreground text-justify">
                                                    <FormattedTextDisplay
                                                        text={contribution.text}
                                                        meetingId={meeting.id}
                                                        cityId={meeting.cityId}
                                                        linkColor="black"
                                                    />
                                                </div>

                                                {/* AI Generated Badge */}
                                                <div className="flex justify-end">
                                                    <AIGeneratedBadge />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    ) : (
                        /* FALLBACK: Render Speaker Segments (old format) */
                        <div className="space-y-3">
                            {(!speakerSegments || speakerSegments.length === 0) ? (
                                <div className="bg-card rounded-lg p-8 text-center border">
                                    <p className="text-sm text-muted-foreground">
                                        Δεν υπάρχουν τοποθετήσεις ομιλητών
                                    </p>
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
                    )}
                </div>

                {/* Location Section (Collapsible) */}
                {location && (
                    <Collapsible>
                        <div className="bg-card rounded-lg overflow-hidden">
                            <CollapsibleTrigger asChild>
                                <button className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-muted-foreground" />
                                        <span className="font-medium">Προβολή χάρτη</span>
                                    </div>
                                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform" />
                                </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="h-[300px] w-full border-t">
                                    <Map
                                        center={location.coordinates ? [location.coordinates.y, location.coordinates.x] : undefined}
                                        zoom={15}
                                        features={mapFeatures}
                                        animateRotation={false}
                                    />
                                </div>
                            </CollapsibleContent>
                        </div>
                    </Collapsible>
                )}

                {/* Admin Panel (Collapsible) - Groups notification importance + debug */}
                {((topicImportance || proximityImportance) || true) && ( // true for debug section which checks auth internally
                    <Collapsible>
                        <div className="bg-muted/30 rounded-lg overflow-hidden border border-dashed">
                            <CollapsibleTrigger asChild>
                                <button className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <ScrollText className="w-4 h-4 text-muted-foreground" />
                                        <span className="font-medium text-sm">Διαχειριστικά στοιχεία</span>
                                    </div>
                                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform" />
                                </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="border-t">
                                <div className="p-4 space-y-4">
                                    {/* Notification Importance */}
                                    {(topicImportance || proximityImportance) && (
                                        <div className="space-y-2">
                                            <div className="text-sm font-medium">Σημασία ειδοποιήσεων</div>
                                            <p className="text-xs text-muted-foreground">
                                                Αυτές οι πληροφορίες καθορίζουν ποιοι χρήστες θα ειδοποιηθούν για αυτό το θέμα με βάση τις προτιμήσεις τους.
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {topicImportance && (
                                                    <Badge variant="secondary">
                                                        Σημασία Θέματος: {
                                                            topicImportance === 'high' ? 'Υψηλή' :
                                                            topicImportance === 'normal' ? 'Κανονική' :
                                                            'Καμία'
                                                        }
                                                    </Badge>
                                                )}
                                                {proximityImportance && (
                                                    <Badge variant="secondary">
                                                        Σημασία Εγγύτητας: {
                                                            proximityImportance === 'wide' ? 'Ευρεία' :
                                                            proximityImportance === 'near' ? 'Κοντινή' :
                                                            'Καμία'
                                                        }
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Debug Utterances - Will show/hide based on auth internally */}
                                    <DebugUtterances subjectId={subject.id} />
                                </div>
                            </CollapsibleContent>
                        </div>
                    </Collapsible>
                )}
            </div>
        </div>
    );
}