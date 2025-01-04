import { Party, Subject, Topic } from "@prisma/client";
import { Statistics } from "@/lib/statistics";
import { useCouncilMeetingData } from "./meetings/CouncilMeetingDataContext";
import { SubjectWithRelations } from "@/lib/db/subject";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { ColorPercentageRing } from "./ui/color-percentage-ring";
import Icon from "./icon";
import { MapPin, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { PersonAvatarList } from "./persons/PersonAvatarList";

export function SubjectCard({ subject, fullWidth }: { subject: SubjectWithRelations & { statistics?: Statistics }, fullWidth?: boolean }) {
    const colorPercentages = subject.statistics?.parties?.map(p => ({
        color: p.item.colorHex,
        percentage: p.speakingSeconds / subject.statistics!.speakingSeconds * 100
    })) || [];
    const { parties, city, meeting } = useCouncilMeetingData();

    const partyIdToColorHex = (partyId: Party["id"]) => {
        const party = parties.find(p => p.id === partyId);
        return party?.colorHex || "gray";
    }

    const borderColor = subject.topic?.colorHex || "gray";
    const backgroundColor = subject.topic?.colorHex ? subject.topic.colorHex + "15" : "transparent";

    // Get top 5 speakers by speaking time
    const topSpeakers = subject.statistics?.people
        ?.sort((a, b) => b.speakingSeconds - a.speakingSeconds)
        .slice(0, 5)
        .map(p => ({
            ...p.item,
            party: p.item.partyId ? parties.find(party => party.id === p.item.partyId) || null : null
        })) || [];

    return (
        <Link href={`/${city.id}/${meeting.id}/subjects/${subject.id}`} className="hover:no-underline">
            <Card style={{ borderColor, backgroundColor }} className={cn(fullWidth ? "w-full" : "w-56 md:w-96", "flex flex-col", "hover:shadow-md transition-shadow", "min-h-64")}>
                <CardHeader className="flex flex-col gap-2">
                    <div className="flex flex-row items-center gap-2">
                        <div className="p-2 rounded-full" style={{ backgroundColor: subject.topic?.colorHex ? subject.topic.colorHex + "20" : "#e5e7eb" }}>
                            <Icon name={subject.topic?.icon as any || "Hash"} color={subject.topic?.colorHex || "#9ca3af"} size={20} />
                        </div>
                        <CardTitle className="text-md flex-1">{subject.name}</CardTitle>
                    </div>
                    <div className="flex flex-col md:flex-row md:justify-between md:gap-2">
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-4 h-4 inline-block" />
                            {subject.location?.text || "Χωρίς τοποθεσία"}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <ScrollText className="w-4 h-4 inline-block" />
                            {subject.agendaItemIndex ? `Θέμα διάταξης #${subject.agendaItemIndex}` : "Εκτός ημερησίας"}
                        </div>
                    </div>

                </CardHeader>
                <CardContent className="flex-grow">
                    {subject.description && (
                        <div className="flex-grow text-sm text-muted-foreground line-clamp-2">{subject.description}</div>
                    )}
                </CardContent>
                <CardFooter className="flex-shrink">
                    <div className="mt-auto" onClick={(e) => e.stopPropagation()}>
                        <PersonAvatarList
                            users={topSpeakers}
                        />
                    </div>
                </CardFooter>
            </Card>
        </Link>
    );
}