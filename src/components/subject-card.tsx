import { City, CouncilMeeting, Party, Subject, Topic } from "@prisma/client";
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

export function SubjectCard({ subject, city, meeting, parties, fullWidth }: { subject: SubjectWithRelations & { statistics?: Statistics }, city: City, meeting: CouncilMeeting, parties: Party[], fullWidth?: boolean }) {
    const colorPercentages = subject.statistics?.parties?.map(p => ({
        color: p.item.colorHex,
        percentage: p.speakingSeconds / subject.statistics!.speakingSeconds * 100
    })) || [];

    // Get top 5 speakers by speaking time
    const topSpeakers = subject.statistics?.people
        ?.sort((a, b) => b.speakingSeconds - a.speakingSeconds)
        .slice(0, 5)
        .map(p => ({
            ...p.item,
            party: p.item.partyId ? parties.find(party => party.id === p.item.partyId) || null : null
        })) || [];

    return (
        <Link href={`/${city.id}/${meeting.id}/subjects/${subject.id}`} className="block hover:no-underline">
            <Card className={cn(
                "flex flex-col hover:shadow-md transition-shadow h-full",
                fullWidth ? "w-full" : "w-full"
            )}>
                <CardHeader className="flex flex-col gap-1.5 pb-2">
                    <div className="flex flex-row items-center gap-1.5">
                        <div className="p-1.5 rounded-full shrink-0" style={{ backgroundColor: subject.topic?.colorHex ? subject.topic.colorHex + "20" : "#e5e7eb" }}>
                            <Icon name={subject.topic?.icon as any || "Hash"} color={subject.topic?.colorHex || "#9ca3af"} size={16} />
                        </div>
                        <CardTitle className="text-sm sm:text-base line-clamp-2 flex-1">{subject.name}</CardTitle>
                    </div>
                    <div className="flex flex-row justify-between gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            {subject.location?.text || "Χωρίς τοποθεσία"}
                        </div>
                        <div className="flex items-center gap-1">
                            <ScrollText className="w-3.5 h-3.5 shrink-0" />
                            {subject.agendaItemIndex ? `#${subject.agendaItemIndex}` : "Εκτός"}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="flex-grow pb-2 max-w-full">
                    {subject.description && (
                        <div className="text-xs sm:text-sm text-muted-foreground line-clamp-2 sm:line-clamp-3">{subject.description}</div>
                    )}
                </CardContent>
                <CardFooter className="pt-0">
                    <div onClick={(e) => e.stopPropagation()}>
                        <PersonAvatarList
                            users={topSpeakers}
                        />
                    </div>
                </CardFooter>
            </Card>
        </Link>
    );
}