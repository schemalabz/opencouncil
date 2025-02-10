import Map from "@/components/map/map";
import { SubjectWithRelations } from "@/lib/db/subject";
import { Statistics } from "@/lib/statistics";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import TopicBadge from "../transcript/Topic";
import { useVideo } from "../VideoProvider";
import { Button } from "@/components/ui/button";
import { Play, FileText, MapPin, ScrollText } from "lucide-react";
import { PersonBadge } from "@/components/persons/PersonBadge";
import { Link } from "@/i18n/routing";
import { ColorPercentageRing } from "@/components/ui/color-percentage-ring";
import Icon from "@/components/icon";
import { subjectToMapFeature } from "@/lib/utils";

export default function Subject({ subject }: { subject: SubjectWithRelations & { statistics?: Statistics } }) {
    const { topic, location, description, name, speakerSegments, agendaItemIndex, introducedBy } = subject;
    const { getSpeakerTag, getPerson, getParty, meeting } = useCouncilMeetingData();
    const { seekToAndPlay } = useVideo();

    const colorPercentages = subject.statistics?.parties?.map(p => ({
        color: p.item.colorHex,
        percentage: (p.speakingSeconds / subject.statistics!.speakingSeconds) * 100
    })) || [];

    const totalMinutes = Math.round(subject.statistics?.speakingSeconds ? subject.statistics.speakingSeconds / 60 : 0);

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="bg-card p-6 rounded-lg">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                        <div className="flex-shrink-0">
                            <ColorPercentageRing
                                data={colorPercentages}
                                size={96}
                                thickness={12}
                            >
                                <div className="flex flex-col items-center">
                                    <div className="text-lg font-medium">
                                        {totalMinutes}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        λεπτά
                                    </div>
                                </div>
                            </ColorPercentageRing>
                        </div>
                        <div className="flex-grow">
                            <div className="flex flex-row items-center gap-2">
                                <div className="p-2 rounded-full" style={{ backgroundColor: topic?.colorHex ? topic.colorHex + "20" : "#e5e7eb" }}>
                                    <Icon name={topic?.icon as any || "Hash"} color={topic?.colorHex || "#9ca3af"} size={24} />
                                </div>
                                <h1 className="text-2xl font-bold">{name}</h1>
                            </div>
                            <div className="flex flex-wrap gap-3 mt-2">
                                {topic && (
                                    <div className="flex items-center">
                                        <TopicBadge topic={topic} />
                                    </div>
                                )}

                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <MapPin className="w-4 h-4" />
                                    <span>{location?.text || "Χωρίς τοποθεσία"}</span>
                                </div>

                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <ScrollText className="w-4 h-4" />
                                    <span>{agendaItemIndex ? `Θέμα διάταξης #${agendaItemIndex}` : "Εκτός ημερησίας"}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {description && (
                        <p className="text-muted-foreground">{description}</p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Eisigitis Section */}
                {introducedBy && (
                    <div>
                        <h3 className="text-lg font-semibold mb-4">Εισηγητής</h3>
                        <PersonBadge
                            person={getPerson(introducedBy.id)}
                        />
                    </div>
                )}

                {/* Location Section */}
                {location && (
                    <div>
                        <h3 className="text-lg font-semibold mb-4">Τοποθεσία</h3>
                        <p className="text-sm text-muted-foreground mb-4">{location.text}</p>
                        <div className="h-[300px] w-full rounded-md overflow-hidden">
                            <Map
                                center={location.coordinates ? [location.coordinates.y, location.coordinates.x] : undefined}
                                zoom={15}
                                features={location ? [subjectToMapFeature(subject)].filter((f): f is NonNullable<ReturnType<typeof subjectToMapFeature>> => f !== null) : []}
                                animateRotation={false}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Speaker Segments Section - Full Width */}
            <div>
                <h3 className="text-lg font-semibold mb-4">Τοποθετήσεις Ομιλητών</h3>
                <div className="space-y-4">
                    {(!speakerSegments || speakerSegments.length === 0) ? (
                        <p className="text-sm text-muted-foreground text-center">Δεν υπάρχουν τοποθετήσεις ομιλητών</p>
                    ) : (
                        speakerSegments.map(segment => {
                            const speakerTag = getSpeakerTag(segment.speakerSegment.speakerTagId);
                            const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
                            const party = person?.partyId ? getParty(person.partyId) : undefined;
                            if (!speakerTag) return null;

                            const timeParam = `t=${Math.floor(segment.speakerSegment.startTimestamp)}`;
                            const transcriptUrl = `/${meeting.cityId}/${meeting.id}/transcript?${timeParam}`

                            return (
                                <div key={segment.speakerSegmentId} className="rounded-lg border bg-card text-card-foreground shadow-sm">
                                    <div className="p-4">
                                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                                            <PersonBadge
                                                person={person ? { ...person, party: party || null } : undefined}
                                                speakerTag={speakerTag}
                                            />
                                            <div className="flex gap-2">
                                                <Button
                                                    onClick={() => seekToAndPlay(segment.speakerSegment.startTimestamp)}
                                                    variant="outline"
                                                    size="sm"
                                                >
                                                    <Play className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    size="sm"
                                                >
                                                    <Link href={transcriptUrl}>
                                                        <FileText className="h-4 w-4 mr-2" />
                                                        Απομαγνητοφώνηση
                                                    </Link>
                                                </Button>
                                            </div>
                                        </div>
                                        {segment.summary ? (
                                            <div className="mt-4 pl-4 border-l-2 border-muted">
                                                <p className="text-muted-foreground">{segment.summary}</p>
                                            </div>
                                        ) : (
                                            <p className="text-center text-sm mt-8 text-muted-foreground italic">Δεν υπάρχει αυτόματη σύνοψη για αυτή τη τοποθέτηση</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}