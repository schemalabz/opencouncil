import Map from "@/components/map/map";
import SpeakerBadge from "@/components/SpeakerBadge";
import { SubjectWithRelations } from "@/lib/db/subject";
import { Statistics } from "@/lib/statistics";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import TopicBadge from "../transcript/Topic";

export default function Subject({ subject }: { subject: SubjectWithRelations & { statistics: Statistics | null } }) {
    const { topic, location, description, name, speakerSegments } = subject;
    const { getSpeakerTag, getPerson, getParty } = useCouncilMeetingData();

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
                <div className="flex-1">
                    <h1 className="text-2xl font-bold">{name}</h1>
                    {description && (
                        <p className="mt-2 text-muted-foreground">{description}</p>
                    )}
                    {topic && (
                        <TopicBadge topic={topic} />

                    )}
                </div>
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

                    return (
                        <div key={segment.speakerSegmentId} className="rounded-lg border bg-card text-card-foreground shadow-sm">
                            <div className="p-4">
                                <SpeakerBadge
                                    speakerTag={speakerTag}
                                    person={person}
                                    party={party}
                                    withLeftBorder
                                />
                                {segment.summary && (
                                    <div className="mt-4 pl-4 border-l-2 border-muted">
                                        <p className="text-muted-foreground">{segment.summary}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

}