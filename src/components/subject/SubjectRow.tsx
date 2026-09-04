import { AdministrativeBody, City, CouncilMeeting } from "@prisma/client";
import { useSubjectBarHover } from '@/components/meetings/bar/BarHighlightContext';
import { Statistics } from "@/lib/statistics";
import { SubjectWithRelations } from "@/lib/db/subject";
import { surfaceCardClass } from "@/components/ui/surface-card";
import { TopicIcon } from "@/components/TopicIcon";
import { SubjectImage } from "@/components/subject/SubjectImage";
import { subjectCardStats } from "@/lib/subjectCardStats";
import { getAgendaFullLabel, getWithdrawnLabel } from "@/lib/utils/subjects";
import { Link, useRouter } from "@/i18n/routing";
import { PersonWithRelations } from "@/lib/db/people";
import { stripMarkdown } from "@/lib/formatters/markdown";
import { formatDate } from "@/lib/formatters/time";
import { getLocalizedName } from "@/lib/formatters/name";
import { useLocalizeText } from "@/hooks/useLocalizeText";
import { cn } from "@/lib/utils";
import type { PendingKind } from "@/lib/meetingStage";
import { topicStyle } from "@/lib/topicStyle";
import { Clock, Loader2, MapPin, MessageSquare, ScrollText } from "lucide-react";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";


interface SubjectRowProps {
    subject: SubjectWithRelations & { statistics?: Statistics };
    city: City;
    meeting: CouncilMeeting & { administrativeBody?: AdministrativeBody | null };
    /** Kept for the callers; the row no longer draws its speakers. */
    persons?: PersonWithRelations[];
    /** Show the city / body / date line — off when the row already sits inside a meeting. */
    showContext?: boolean;
    /** What a row says in place of the stats it does not have yet — the meeting's stage decides. */
    pending?: PendingKind | null;
    openInNewTab?: boolean;
    /** The row was opened. Fires for a new tab too, where the Link navigates itself. */
    onOpen?: () => void;
}

/** One fact of the meta line: an icon and its text. */
function MetaItem({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
    return (
        <span className="flex min-w-0 items-center gap-1">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{children}</span>
        </span>
    );
}

/**
 * A subject as a single full-width row — the layout the search results use. It carries the
 * same facts as the SubjectCard (topic, context, title, agenda marker, description, location,
 * speaking stats), laid out horizontally. A result list then reads top to bottom,
 * one result per line, instead of as a grid of tiles.
 */
export function SubjectRow({ subject, city, meeting, showContext = true, pending, openInNewTab, onOpen }: SubjectRowProps) {
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations("Subject");
    const tStage = useTranslations("meetingStage");
    const locale = useLocale();
    const localize = useLocalizeText();
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setIsLoading(false);
    }, [pathname]);

    const href = `/${city.id}/${meeting.id}/subjects/${subject.id}`;

    // Lights this subject's runs on the meeting playback bar; a no-op on
    // pages without one (search, city tabs).
    const barHover = useSubjectBarHover(subject.id);
    const handleClick = (e: React.MouseEvent) => {
        onOpen?.();
        if (openInNewTab) return; // let the Link handle it
        e.preventDefault();
        setIsLoading(true);
        router.push(href);
    };

    const stats = subjectCardStats(subject.statistics, subject.contributions?.length);
    const agendaLabel = getAgendaFullLabel(t, subject);
    const description = subject.description ? localize(stripMarkdown(subject.description)) : null;
    const locationText = subject.location?.text ? localize(subject.location.text) : null;
    const rail = topicStyle(subject.topic?.colorHex).border;
    const context = [
        getLocalizedName(city, locale),
        meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : null,
        formatDate(new Date(meeting.dateTime), undefined, locale),
    ].filter(Boolean).join(" · ");

    const isPending = pending != null && stats.minutes === 0 && stats.speakerCount === 0;
    // A transcript on its way promises what the review does: the summary comes after the check.
    const rowNote = pending === 'processing' ? 'review' : pending;

    return (
        <Link
            href={href}
            prefetch={false}
            className="block hover:no-underline"
            onClick={handleClick}
            {...barHover}
            {...(openInNewTab && { target: "_blank", rel: "noopener noreferrer" })}
        >
            <div
                className={cn(
                    surfaceCardClass,
                    "group/row relative w-full overflow-hidden transition-shadow duration-300 hover:shadow-md",
                    subject.withdrawn && "opacity-60",
                )}
            >
                {isLoading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-background/90 backdrop-blur-sm">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                )}

                {/* Topic rail — gives a list of rows a colour rhythm you can scan down. It takes
                    over the card's left edge, border included, so it has to end on the card's
                    outline. A radius on the rail itself cannot do that: the rail is 4px wide, so
                    the browser clamps an 8px corner down to 4px and the corner ends up outside the
                    card. The rail is square instead, and this wrapper clips it to the outline.
                    The radius is the literal 1rem of the shared card surface —
                    `rounded-lg` resolves to --radius, which is 0 in this theme. */}
                <div
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                    style={{ borderRadius: "1rem" }}
                    aria-hidden="true"
                >
                    <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: rail }} />
                </div>

                {/* The illustration fills the row, faded by a scrim in the card's own
                    colour, as on the city page's hot topics. The scrim, rather than an
                    opacity on the image, is what gives the text one contrast ratio
                    against every picture the model draws: an opacity bleaches the light
                    images and leaves the dark ones heavy. It thins on hover. */}
                <span className="absolute inset-0 z-0" aria-hidden>
                    <SubjectImage subjectId={subject.id} alt="" />
                </span>
                <span
                    className="absolute inset-0 z-0 bg-card/80 transition-colors duration-300 group-hover/row:bg-card/70"
                    aria-hidden
                />
                <div className="relative flex flex-col gap-3 py-3 pl-4 pr-3 sm:flex-row sm:items-stretch sm:gap-6 sm:py-4 sm:pl-5 sm:pr-4">
                    {/* Topic and text — everything that identifies the subject */}
                    <div className="flex min-w-0 flex-1 gap-3">
                        <TopicIcon
                            color={subject.topic?.colorHex}
                            icon={subject.topic?.icon}
                            size="lg"
                            className="mt-0.5 self-start transition-colors duration-300"
                        />

                        {/* Capped measure: a row is far wider than a comfortable line of text.
                            65ch keeps the description near the 60–75 characters a line reads best at. */}
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[65ch]">
                            <div className="flex min-w-0 items-center gap-1.5 text-xs leading-tight text-muted-foreground">
                                {showContext && <span className="truncate">{context}</span>}
                                {agendaLabel && (
                                    <>
                                        {showContext && <span aria-hidden="true">·</span>}
                                        <span className="shrink-0 font-medium text-foreground/70">{agendaLabel}</span>
                                    </>
                                )}
                            </div>

                            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug group-hover/row:font-bold sm:text-base">
                                {localize(subject.name)}
                            </h3>

                            {description && (
                                /* Body copy sits at foreground/75 rather than muted-foreground: the
                                   hierarchy is carried by size and weight, so the text a reader
                                   actually reads does not have to pay for it in contrast. */
                                <p className="line-clamp-2 text-sm leading-relaxed text-foreground/75">
                                    {description}
                                </p>
                            )}

                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {/* The meeting name is context too: on the meeting's own page
                                    the h1 already says it, N rows repeating it said nothing. */}
                                {showContext && <MetaItem icon={ScrollText}>{getLocalizedName(meeting, locale)}</MetaItem>}
                                <MetaItem icon={MapPin}>{locationText ?? t("noLocation")}</MetaItem>
                            </div>
                        </div>
                    </div>

                    {/* The discussion — how long, how many spoke, which parties. Trailing on
                        desktop, on the line of the context meta opposite it. On mobile it is
                        its own line under the text, taking the text column's indent (the icon
                        box and its gap) so it reads as a line of it. */}
                    <div className="flex shrink-0 flex-row items-center gap-x-3 pl-[52px] sm:flex-col sm:items-end sm:justify-start sm:gap-y-1.5 sm:pl-0">
                        {subject.withdrawn ? (
                            <span className="text-xs italic text-muted-foreground/70">
                                {getWithdrawnLabel(t, subject)}
                            </span>
                        ) : isPending ? (
                            <span className="flex items-center gap-1.5 text-xs italic text-muted-foreground/80">
                                {rowNote === 'review' && <Clock className="h-3.5 w-3.5 shrink-0 text-yellow-600" aria-hidden />}
                                {tStage(`rows.${rowNote}`)}
                            </span>
                        ) : (
                            <>
                                {(stats.minutes > 0 || stats.speakerCount > 0 || stats.partyDots.length > 0) && (
                                    <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
                                        {stats.minutes > 0 && (
                                            <MetaItem icon={Clock}>{t("minutesCount", { count: stats.minutes })}</MetaItem>
                                        )}
                                        {stats.speakerCount > 0 && (
                                            <MetaItem icon={MessageSquare}>{stats.speakerCount}</MetaItem>
                                        )}
                                        {stats.partyDots.length > 0 && (
                                            <span className="flex shrink-0 items-center gap-1">
                                                {stats.partyDots.map(p => (
                                                    <span
                                                        key={p.id}
                                                        className="h-2.5 w-2.5 rounded-full"
                                                        style={{ backgroundColor: p.colorHex }}
                                                        title={p.name}
                                                    />
                                                ))}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    );
}
