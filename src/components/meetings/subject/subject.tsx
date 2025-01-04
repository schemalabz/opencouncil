import Map from "@/components/map/map";
import { SubjectWithRelations } from "@/lib/db/subject";
import { Statistics } from "@/lib/statistics";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import TopicBadge from "../transcript/Topic";
import { useVideo } from "../VideoProvider";
import { Button } from "@/components/ui/button";
import { Play, FileText, MapPin, ScrollText } from "lucide-react";
import { UserBadge } from "@/components/user/UserBadge";
import { Link } from "@/i18n/routing";

export default function Subject({ subject }: { subject: SubjectWithRelations & { statistics?: Statistics } }) {
    const { topic, location, description, name, speakerSegments, agendaItemIndex } = subject;
    const { getSpeakerTag, getPerson, getParty, meeting } = useCouncilMeetingData();
    const { seekToAndPlay } = useVideo();

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <h1 className="text-2xl font-bold">{name}</h1>

                    <div className="flex flex-wrap gap-3">
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

                {description && (
                    <p className="text-muted-foreground">{description}</p>
                )}
            </div>

            {/* Location Map */}
            {location && (
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
                    <div className="p-6">
                        <h3 className="text-lg font-semibold">Τοποθεσία</h3>
                        <p className="text-sm text-muted-foreground mb-4">{location.text}</p>
                        <div className="h-[300px] w-full rounded-md overflow-hidden">
                            <Map
                                center={[23.7275, 37.9838]} // You'll need to extract coordinates from location.coordinates
                                zoom={15}
                                animateRotation={false}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Speaker Segments */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Τοποθετήσεις Ομιλητών</h3>
                {speakerSegments?.map(segment => {
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
                                    <UserBadge
                                        imageUrl={person?.image || null}
                                        name={person?.name_short || speakerTag.label || ''}
                                        role={person?.role || null}
                                        party={party || null}
                                        withBorder={true}
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
                })}
            </div>
        </div>
    );
}