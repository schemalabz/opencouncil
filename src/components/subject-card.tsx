import { AdministrativeBody, City, CouncilMeeting, Party } from "@prisma/client";
import { Statistics } from "@/lib/statistics";
import { SubjectWithRelations } from "@/lib/db/subject";
import { SubjectCardContent } from "./subject/SubjectCardContent";
import { SubjectCardFooter } from "./subject/SubjectCardFooter";
import { subjectCardStats } from "@/lib/subjectCardStats";
import { subjectDisplayedSpeakers } from "@/lib/subjectSpeakers";
import { Loader2 } from "lucide-react";
import { getAgendaLabel, getWithdrawnLabel } from "@/lib/utils/subjects";
import { Link, useRouter } from "@/i18n/routing";
import { PersonWithRelations } from '@/lib/db/people';
import { HighlightVideo } from "./meetings/HighlightVideo";
import { HighlightWithUtterances } from "@/lib/db/highlights";
import { renderHighlighted } from "@/lib/search/highlight";
import { formatDate } from "@/lib/formatters/time";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useLocalizeText } from "@/hooks/useLocalizeText";
import { getLocalizedName } from "@/lib/formatters/name";

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
    // Elasticsearch highlight fragments (matched terms wrapped in sentinel tags).
    // When present, the matched terms are bolded in the title/description.
    nameHighlight?: string;
    descriptionHighlight?: string;
}

export function SubjectCard({ subject, city, meeting, parties, persons, fullWidth, highlight, disableHover, showContext, openInNewTab, nameHighlight, descriptionHighlight }: SubjectCardProps) {
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations("Subject");
    const locale = useLocale();
    const localize = useLocalizeText();
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

    const fullDisplayedSpeakers = subjectDisplayedSpeakers(subject, persons);

    const stats = subjectCardStats(
        subject.statistics,
        subject.contributions?.length
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
            introducerId={subject.introducedBy?.id}
            withdrawn={subject.withdrawn}
            withdrawnLabel={getWithdrawnLabel(t, subject)}
            minutesText={t('minutesCount', { count: stats.minutes })}
            avatarsAutoScroll
            avatarsHovered={isCardHovered}
            onAvatarsClick={(e) => e.stopPropagation()}
        />
    );

    return (
        <Link {...linkProps} onClick={handleClick} onMouseEnter={() => setIsCardHovered(true)} onMouseLeave={() => setIsCardHovered(false)}>
            <SubjectCardContent
                title={renderHighlighted(nameHighlight, localize(subject.name))}
                topic={subject.topic}
                context={showContext ? {
                    meta: [getLocalizedName(city, locale), meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : null, formatDate(new Date(meeting.dateTime), undefined, locale)].filter(Boolean).join(" · "),
                    meetingName: getLocalizedName(meeting, locale),
                } : null}
                locationText={subject.location?.text ? localize(subject.location.text) : t("noLocation")}
                agendaLabel={getAgendaLabel(t, subject)}
                description={subject.description ? renderHighlighted(descriptionHighlight, localize(subject.description), true) : null}
                mediaSlot={highlight?.muxPlaybackId ? (
                    <div className="mb-4" onClick={(e) => e.stopPropagation()}>
                        <HighlightVideo
                            id={highlight.id}
                            title={localize(highlight.name)}
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
