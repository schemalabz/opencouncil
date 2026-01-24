import { City, CouncilMeeting, Party, Subject, Topic } from "@prisma/client";
import { Statistics } from "@/lib/statistics";
import { useCouncilMeetingData } from "./meetings/CouncilMeetingDataContext";
import { SubjectWithRelations } from "@/lib/db/subject";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { ColorPercentageRing } from "./ui/color-percentage-ring";
import Icon from "./icon";
import { MapPin, ScrollText, Calendar } from "lucide-react";
import { cn, getPartyFromRoles } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { PersonAvatarList } from "./persons/PersonAvatarList";
import { PersonWithRelations } from '@/lib/db/people';
import { HighlightVideo } from "./meetings/HighlightVideo";
import { HighlightWithUtterances } from "@/lib/db/highlights";
import { stripMarkdown } from "@/lib/formatters/markdown";

interface SubjectCardProps {
    subject: SubjectWithRelations & { statistics?: Statistics };
    city: City;
    meeting: CouncilMeeting;
    parties: Party[];
    persons: PersonWithRelations[];
    fullWidth?: boolean;
    highlight?: HighlightWithUtterances;
    disableHover?: boolean;
    showContext?: boolean;
    openInNewTab?: boolean;
}

export function SubjectCard({ subject, city, meeting, parties, persons, fullWidth, highlight, disableHover, showContext, openInNewTab }: SubjectCardProps) {
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
            party: getPartyFromRoles(p.item.roles)
        })) || [];

    // Add the introducer at the start if they exist and aren't already in top speakers
    const introducerWithParty = subject.introducedBy ? {
        ...subject.introducedBy,
        party: getPartyFromRoles(subject.introducedBy.roles),
        isIntroducer: true
    } : null;

    const displayedSpeakers = introducerWithParty
        ? [introducerWithParty, ...topSpeakers.filter(s => s.id !== introducerWithParty.id)]
        : topSpeakers;

    const fullDisplayedSpeakers = displayedSpeakers
        .map(s => persons.find(p => p.id === s.id))
        .filter((p): p is PersonWithRelations => p !== undefined);

    const linkProps = {
        href: `/${city.id}/${meeting.id}/subjects/${subject.id}`,
        className: "block hover:no-underline",
        ...(openInNewTab && { target: "_blank", rel: "noopener noreferrer" })
    };

    return (
        <Link {...linkProps}>
            <Card disableHover={disableHover} className={cn(
                "flex flex-col group/card hover:shadow-md transition-all duration-300",
                fullWidth ? "w-full" : "w-full",
                highlight?.muxPlaybackId ? "h-auto" : "h-[280px]",
                disableHover ? "hover:shadow-none" : ""
            )}>
                <CardHeader className="flex flex-col gap-1.5 pb-2">
                    {showContext && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 -mt-1 -mb-1">
                            <span className="truncate">
                                {city.name} • {meeting.name}
                            </span>
                        </div>
                    )}
                    <div className="flex flex-row items-center gap-1.5">
                        <div className="p-1.5 rounded-full shrink-0 transition-colors duration-300" style={{ backgroundColor: subject.topic?.colorHex ? subject.topic.colorHex + "20" : "#e5e7eb" }}>
                            <Icon name={subject.topic?.icon as any || "Hash"} color={subject.topic?.colorHex || "#9ca3af"} size={16} />
                        </div>
                        <CardTitle className="text-sm sm:text-base line-clamp-2 flex-1 group-hover/card:text-accent-foreground transition-colors duration-300">{subject.name}</CardTitle>
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
                    {highlight?.muxPlaybackId && (
                        <div className="mb-4" onClick={(e) => e.stopPropagation()}>
                            <HighlightVideo
                                id={highlight.id}
                                title={highlight.name}
                                playbackId={highlight.muxPlaybackId}
                                videoUrl={highlight.videoUrl || undefined}
                            />
                        </div>
                    )}
                    {subject.description && (
                        <div className="text-xs sm:text-sm text-muted-foreground line-clamp-2 sm:line-clamp-3 group-hover/card:text-muted-foreground/80 transition-colors duration-300">{stripMarkdown(subject.description)}</div>
                    )}
                </CardContent>
                <CardFooter className="pt-0 mt-auto flex flex-col h-[52px]">
                    <div onClick={(e) => e.stopPropagation()} className="w-full">
                        <PersonAvatarList
                            users={fullDisplayedSpeakers}
                        />
                    </div>
                    {showContext && (
                        <div className="flex justify-end w-full mt-auto">
                            <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(meeting.dateTime).toLocaleDateString('el-GR', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </span>
                        </div>
                    )}
                </CardFooter>
            </Card>
        </Link>
    );
}