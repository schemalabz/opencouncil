import { AdministrativeBody, City, CouncilMeeting, Party } from "@prisma/client";
import { Statistics } from "@/lib/statistics";
import { SubjectWithRelations } from "@/lib/db/subject";
import { SubjectCardContent } from "./subject/SubjectCardContent";
import { SubjectCardFooter } from "./subject/SubjectCardFooter";
import { subjectCardStats } from "@/lib/subjectCardStats";
import { Loader2 } from "lucide-react";
import { getPartyFromRoles } from "@/lib/utils";
import { getAgendaLabel, getWithdrawnLabel } from "@/lib/utils/subjects";
import { Link, useRouter } from "@/i18n/routing";
import { PersonWithRelations } from '@/lib/db/people';
import { HighlightVideo } from "./meetings/HighlightVideo";
import { HighlightWithUtterances } from "@/lib/db/highlights";
import { stripMarkdown } from "@/lib/formatters/markdown";
import { formatDate } from "@/lib/formatters/time";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

interface SubjectCardProps {
    subject: SubjectWithRelations & { statistics?: Statistics };
    city: City;
    meeting: CouncilMeeting & { administrativeBody?: AdministrativeBody | null };
    parties: Party[];
    persons: PersonWithRelations[];
    fullWidth?: boolean;
    highlight?: HighlightWithUtterances;
    disableHover?: boolean;
    showContext?: boolean;
    openInNewTab?: boolean;
}

export function SubjectCard({ subject, city, meeting, parties, persons, fullWidth, highlight, disableHover, showContext, openInNewTab }: SubjectCardProps) {
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations("Subject");
    const [isLoading, setIsLoading] = useState(false);
    const [isCardHovered, setIsCardHovered] = useState(false);

    useEffect(() => {
        setIsLoading(false);
    }, [pathname]);

    const handleClick = (e: React.MouseEvent) => {
        if (openInNewTab) return; // let the Link handle it
        e.preventDefault();
        setIsLoading(true);
        router.push(`/${city.id}/${meeting.id}/subjects/${subject.id}`);
    };

    // Get top 5 speakers by speaking time (spread to avoid mutating shared data)
    const topSpeakers = [...(subject.statistics?.people ?? [])]
        .sort((a, b) => b.speakingSeconds - a.speakingSeconds)
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

    const stats = subjectCardStats(
        subject.statistics,
        subject.contributions?.length || subject.speakerSegments?.length
    );

    const linkProps = {
        href: `/${city.id}/${meeting.id}/subjects/${subject.id}`,
        className: "block hover:no-underline flex-1",
        ...(openInNewTab && { target: "_blank", rel: "noopener noreferrer" })
    };

    const footer = (
        <SubjectCardFooter
            stats={stats}
            speakers={fullDisplayedSpeakers}
            withdrawn={subject.withdrawn}
            withdrawnLabel={getWithdrawnLabel(subject)}
            avatarsAutoScroll
            avatarsHovered={isCardHovered}
            onAvatarsClick={(e) => e.stopPropagation()}
        />
    );

    return (
        <Link {...linkProps} onClick={handleClick} onMouseEnter={() => setIsCardHovered(true)} onMouseLeave={() => setIsCardHovered(false)}>
            <SubjectCardContent
                title={subject.name}
                topic={subject.topic}
                context={showContext ? {
                    meta: [city.name, meeting.administrativeBody?.name, formatDate(new Date(meeting.dateTime))].filter(Boolean).join(" · "),
                    meetingName: meeting.name,
                } : null}
                locationText={subject.location?.text || t("noLocation")}
                agendaLabel={getAgendaLabel(t, subject)}
                description={subject.description ? stripMarkdown(subject.description) : null}
                mediaSlot={highlight?.muxPlaybackId ? (
                    <div className="mb-4" onClick={(e) => e.stopPropagation()}>
                        <HighlightVideo
                            id={highlight.id}
                            title={highlight.name}
                            playbackId={highlight.muxPlaybackId}
                            videoUrl={highlight.videoUrl || undefined}
                        />
                    </div>
                ) : undefined}
                footer={footer}
                overlay={isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-sm z-20 rounded-lg">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                ) : undefined}
                disableHover={disableHover}
                dimmed={subject.withdrawn}
            />
        </Link>
    );
}
