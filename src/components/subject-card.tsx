import { City, CouncilMeeting, Party, Subject, Topic } from "@prisma/client";
import { Statistics } from "@/lib/statistics";
import { useCouncilMeetingData } from "./meetings/CouncilMeetingDataContext";
import { SubjectWithRelations } from "@/lib/db/subject";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { ColorPercentageRing } from "./ui/color-percentage-ring";
import Icon from "./icon";
import { MapPin, ScrollText, PresentationIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { PersonAvatarList } from "./persons/PersonAvatarList";
import { PersonWithRelations } from '@/lib/db/people';

export function SubjectCard({ subject, city, meeting, parties, persons, fullWidth }: { subject: SubjectWithRelations & { statistics?: Statistics }, city: City, meeting: CouncilMeeting, parties: Party[], persons: PersonWithRelations[], fullWidth?: boolean }) {
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

    // Add the introducer at the start if they exist and aren't already in top speakers
    const introducerWithParty = subject.introducedBy ? {
        ...subject.introducedBy,
        party: subject.introducedBy?.partyId ? parties.find(party => party.id === subject.introducedBy!.partyId) || null : null,
        isIntroducer: true
    } : null;

    const displayedSpeakers = introducerWithParty
        ? [introducerWithParty, ...topSpeakers.filter(s => s.id !== introducerWithParty.id)]
        : topSpeakers;

    const fullDisplayedSpeakers = displayedSpeakers
        .map(s => persons.find(p => p.id === s.id))
        .filter((p): p is PersonWithRelations => p !== undefined);

    return (
        <Link href={`/${city.id}/${meeting.id}/subjects/${subject.id}`} className="block hover:no-underline">
            <Card className={cn(
                "flex flex-col hover:shadow-md transition-shadow h-[280px]",
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
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                                {subject.location?.text || "Χωρίς τοποθεσία"}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <ScrollText className="w-3.5 h-3.5 shrink-0" />
                            <div className="text-xs text-muted-foreground">
                                {subject.agendaItemIndex ?
                                    `#${subject.agendaItemIndex}` :
                                    subject.nonAgendaReason === 'beforeAgenda' ?
                                        "Προ ημερησίας" :
                                        "Εκτός ημερησίας"
                                }
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 pb-2 max-w-full overflow-hidden">
                    {subject.description && (
                        <div className="text-xs sm:text-sm text-muted-foreground line-clamp-2 sm:line-clamp-3">{subject.description}</div>
                    )}
                </CardContent>
                <CardFooter className="pt-0 mt-auto">
                    <div onClick={(e) => e.stopPropagation()}>
                        <PersonAvatarList
                            users={fullDisplayedSpeakers}
                        />
                    </div>
                </CardFooter>
            </Card>
        </Link>
    );
}