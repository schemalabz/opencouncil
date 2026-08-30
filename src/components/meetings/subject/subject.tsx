"use client";
import Map from "@/components/map/map";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, MapPin, ScrollText, CheckSquare, Landmark, ExternalLink, Loader2, ArrowLeft, Play } from "lucide-react";
import { PersonBadge } from "@/components/persons/PersonBadge";
import { Link } from "@/i18n/routing";
import { ColorPercentageRing } from "@/components/ui/color-percentage-ring";
import { subjectToMapFeature } from "@/lib/utils";
import { notFound } from "next/navigation";
import { SubjectContext } from "./context";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormattedTextDisplay } from "@/components/FormattedTextDisplay";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { DebugUtterances } from "./DebugUtterances";
import { AIGeneratedBadge } from "@/components/AIGeneratedBadge";
import { GroupedDiscussionNotice } from "./grouped-discussion-notice";
import { ContributionCard } from "./ContributionCard";
import { VotingSection } from "./VotingSection";
import { formatDate, formatRelativeTime } from "@/lib/formatters/time";
import { calculateVoteResult } from "@/lib/utils/votes";
import { useTranslations, useLocale } from "next-intl";
import { requestPollDecisionForSubject, getLastPollTimeForMeeting, getDecisionForSubject } from "@/lib/tasks/pollDecisions";
import { useSubjectHeader } from "@/contexts/SubjectHeaderContext";
import { useVideo } from "@/components/meetings/VideoProvider";
import type { Statistics } from "@/lib/statistics";
import Icon from "@/components/icon";
import { topicStyle } from "@/lib/topicStyle";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { getAgendaLabel, getWithdrawnLabel } from "@/lib/utils/subjects";
import { SubjectAdminControls } from "./SubjectAdminControls";
import { useTranscriptOptions } from "../options/OptionsContext";
import { useLocalizeText } from "@/hooks/useLocalizeText";
import { getLocalizedName } from "@/lib/formatters/name";

export default function Subject({ subjectId }: { subjectId?: string }) {
    const { subjects, getPerson, getParty, meeting, city } = useCouncilMeetingData();
    const t = useTranslations("Subject");
    const locale = useLocale();
    const localize = useLocalizeText();
    const { setSubjectHeader } = useSubjectHeader();
    const { data: session } = useSession();
    const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
    const { options } = useTranscriptOptions();
    const [isFetchingDecision, setIsFetchingDecision] = useState(false);
    const [localDecision, setLocalDecision] = useState<{
        ada: string | null;
        decisionNumber: string | null;
        protocolNumber: string | null;
        title: string | null;
        pdfUrl: string;
        publishDate: string | null;
        updatedAt: string | null;
    } | null>(null);
    const [lastSearchedAt, setLastSearchedAt] = useState<string | null>(null);

    // If subjectId is provided, find the subject in the context
    const subject = subjectId ? subjects.find(s => s.id === subjectId) : undefined;

    // If no subject is found, return 404
    if (!subject) {
        notFound();
    }

    const {
        topic,
        location,
        description,
        name,
        agendaItemIndex,
        introducedBy,
        contributions,
        topicImportance,
        proximityImportance,
        discussedIn
    } = subject;

    const colorPercentages = subject.statistics?.parties?.map(p => ({
        color: p.item.colorHex,
        percentage: (p.speakingSeconds / subject.statistics!.speakingSeconds) * 100
    })) || [];

    const totalMinutes = Math.round(subject.statistics?.speakingSeconds ? subject.statistics.speakingSeconds / 60 : 0);
    const agendaLabel = getAgendaLabel(t, subject);

    // Where the subject's discussion starts in the video — the first identified
    // speaker's first utterance, the same lookup every card makes for its own chip.
    const { seekToAndPlay } = useVideo();
    const firstSpeakerId = contributions?.find(c => c.speakerId)?.speakerId ?? null;
    const { data: subjectStart } = useSWR<{ startTimestamp: number; endTimestamp: number }>(
        firstSpeakerId ? `/api/subject/${subject.id}/first-utterance/${firstSpeakerId}` : null,
        (url: string) => fetch(url).then(res => res.ok ? res.json() : null),
    );

    // Memoize map features to prevent unnecessary recalculations
    const mapFeatures = useMemo(() => {
        if (!location) return [];
        const feature = subjectToMapFeature(subject);
        return feature ? [feature] : [];
    }, [subject, location]);

    // Calculate vote result from extracted data
    const voteResult = useMemo(
        () => subject.votes && subject.votes.length > 0 ? calculateVoteResult(subject.votes) : null,
        [subject.votes]
    );

    // The effective decision: local override (from polling) or server-rendered
    const decision = localDecision || subject.decision;

    // Push subject info to the header breadcrumb (display-only, so localized)
    useEffect(() => {
        setSubjectHeader({
            name: localize(name),
            topicIcon: topic?.icon ?? undefined,
            topicColor: topic?.colorHex ?? undefined,
        });
        return () => setSubjectHeader(null);
    }, [name, topic?.icon, topic?.colorHex, setSubjectHeader, localize]);

    // Fetch last poll time on mount when there's no decision
    useEffect(() => {
        if (agendaItemIndex != null && !subject.decision && !subject.withdrawn) {
            getLastPollTimeForMeeting(meeting.id, meeting.cityId).then(setLastSearchedAt);
        }
    }, [agendaItemIndex, subject.decision, subject.withdrawn, meeting.id, meeting.cityId]);

    const handleFetchDecision = useCallback(async () => {
        setIsFetchingDecision(true);
        try {
            const result = await requestPollDecisionForSubject(subject.id);

            // Poll for task completion
            const taskUrl = `/api/cities/${result.cityId}/meetings/${result.meetingId}/taskStatuses/${result.taskId}`;
            for (let i = 0; i < 30; i++) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                try {
                    const response = await fetch(taskUrl);
                    if (response.ok) {
                        const taskStatus = await response.json();
                        if (taskStatus.status === 'succeeded' || taskStatus.status === 'failed') {
                            break;
                        }
                    }
                } catch {
                    // Continue polling on network errors
                }
            }

            // Fetch the decision (may or may not exist after polling)
            const fetched = await getDecisionForSubject(subject.id);
            if (fetched) {
                setLocalDecision(fetched);
            }
            setLastSearchedAt(new Date().toISOString());
        } catch {
            // Still update the timestamp on error
            setLastSearchedAt(new Date().toISOString());
        } finally {
            setIsFetchingDecision(false);
        }
    }, [subject.id]);

    return (
        <div className="min-h-screen bg-background">
            {/* Main Content */}
            {/* max-w-4xl was the old single-column reading width; the two-column layout
                earns more — the rail takes 316px and the prose caps itself in ch. */}
            <div className="mx-auto max-w-6xl space-y-6 px-3 py-4 md:px-6 md:py-6">
                {/* On-page context + back affordance.
                    The breadcrumb in the header is the only other place that
                    shows which meeting/council this subject belongs to and the
                    only "back" path, which users miss (#405). This is a real
                    navigational <Link> to the meeting page, so back never falls
                    back to "/" the way browser history did in #51. */}
                <nav
                    aria-label={t("partOf")}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                >
                    <Link
                        href={`/${meeting.cityId}/${meeting.id}`}
                        aria-label={t("backToMeetingNamed", { meeting: getLocalizedName(meeting, locale) })}
                        className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{getLocalizedName(meeting, locale)}</span>
                    </Link>
                    <span className="text-muted-foreground" aria-hidden="true">·</span>
                    <Link
                        href={`/${meeting.cityId}`}
                        className="text-muted-foreground hover:text-primary transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        {getLocalizedName(city, locale)}
                    </Link>
                    <span className="text-muted-foreground">
                        {formatDate(new Date(meeting.dateTime), undefined, locale)}
                    </span>
                </nav>
                {/* The subject's own title, and the page's h1 — it used to live only in the
                    header bar, at the size that bar gives a page label. The topic names
                    itself above it; the actions jump the video to where the debate starts. */}
                <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
                    <div className="min-w-0">
                        {topic && (
                            <span
                                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold"
                                style={{
                                    backgroundColor: topicStyle(topic.colorHex).background,
                                    borderColor: topicStyle(topic.colorHex).border,
                                    color: topicStyle(topic.colorHex).icon,
                                }}
                            >
                                <Icon name={topic.icon || 'hash'} color="currentColor" size={13} />
                                {getLocalizedName(topic, locale)}
                            </span>
                        )}
                        <h1 className="mt-3 text-balance text-2xl leading-tight tracking-tight md:text-3xl">
                            {localize(name)}
                        </h1>
                        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                            {agendaLabel !== null && (
                                <span className="inline-flex h-5 items-center rounded bg-muted px-2 text-[10.5px] font-bold text-muted-foreground">
                                    {agendaItemIndex ? `${t('categories.agenda.shortLabel')} ${agendaLabel}` : agendaLabel}
                                </span>
                            )}
                            {meeting.administrativeBody && (
                                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Landmark className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {getLocalizedName(meeting.administrativeBody, locale)}
                                </span>
                            )}
                            {totalMinutes > 0 && (
                                <span className="text-xs text-muted-foreground">
                                    {t("speakers", { count: subject.statistics?.people?.length || contributions?.length || 0 })}
                                    {' · '}
                                    {t("minutesCount", { count: totalMinutes })}
                                </span>
                            )}
                        </div>
                    </div>
                    {/* One primary action for the whole page, instead of a button row on
                        every card below: jump the video to where this subject starts. */}
                    {subjectStart && (
                        <div className="flex shrink-0 gap-2 md:pt-8">
                            <button
                                type="button"
                                onClick={() => seekToAndPlay(subjectStart.startTimestamp)}
                                className="inline-flex h-9 items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-bold text-background transition-opacity hover:opacity-90"
                            >
                                <Play className="h-3.5 w-3.5" aria-hidden />
                                {t("watchDiscussion")}
                            </button>
                            <Link
                                href={`/${meeting.cityId}/${meeting.id}/transcript?t=${Math.floor(subjectStart.startTimestamp)}`}
                                className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3.5 text-[13px] font-semibold text-foreground hover:no-underline"
                            >
                                <FileText className="h-4 w-4" aria-hidden />
                                {t("transcript")}
                            </Link>
                        </div>
                    )}
                </header>
                {isSuperAdmin && (
                    <div className="flex justify-end">
                        <SubjectAdminControls
                            subject={subject}
                            cityId={meeting.cityId}
                            meetingId={meeting.id}
                        />
                    </div>
                )}
                {/* Withdrawn notice */}
                {subject.withdrawn && (
                    <div className="rounded-lg border border-muted bg-muted/30 px-4 py-3 text-sm text-muted-foreground italic">
                        {getWithdrawnLabel(t, subject, 'long')}
                    </div>
                )}

                {/* Grouped Discussion Notice */}
                {discussedIn && (
                    <GroupedDiscussionNotice primarySubject={discussedIn} />
                )}

                {/* The page in two columns: the content — summary, context, the
                    τοποθετήσεις — and a quiet rail of facts beside it. The old page
                    stacked everything as identical collapsibles, which buried the
                    discussion (the actual meat) under closed boxes. */}
                {totalMinutes > 0 && (
                    <div className="rounded-2xl border border-border p-3.5 lg:hidden">
                        <DiscussionStats statistics={subject.statistics} totalMinutes={totalMinutes} colorPercentages={colorPercentages} locale={locale} compact />
                    </div>
                )}
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_316px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_336px] xl:gap-14">
                    <div className="min-w-0 space-y-9">
                        {description && (
                            <section>
                                <SectionHead title={t("summary")} />
                                <div className="mt-2 max-w-[70ch] text-[14.5px] leading-[1.65] text-foreground/85">
                                    <FormattedTextDisplay
                                        text={description}
                                        meetingId={meeting.id}
                                        cityId={meeting.cityId}
                                        linkColor="black"
                                    />
                                </div>
                            </section>
                        )}

                        {subject.context && (
                            <SubjectContext subject={subject} />
                        )}

                        <section>
                            <SectionHead title={t("statements")} count={contributions?.length || 0} />
                            {(!contributions || contributions.length === 0) ? (
                                <p className="mt-4 text-sm text-muted-foreground">{t("noStatements")}</p>
                            ) : (
                                <div className="divide-y divide-border">
                                    {contributions.map(contribution => (
                                        <ContributionCard
                                            key={contribution.id}
                                            contribution={contribution}
                                            subjectId={subject.id}
                                            meeting={meeting}
                                            speaker={contribution.speakerId ? getPerson(contribution.speakerId) ?? null : null}
                                            isIntroducer={!!contribution.speakerId && contribution.speakerId === introducedBy?.id}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>

                    <aside className="flex min-w-0 flex-col gap-3.5">
                        {totalMinutes > 0 && (
                            <RailCard title={t("discussionCard")}>
                                <DiscussionStats statistics={subject.statistics} totalMinutes={totalMinutes} colorPercentages={colorPercentages} locale={locale} />
                            </RailCard>
                        )}

                        {introducedBy && (
                            <RailCard title={t("introducer")}>
                                <PersonBadge person={introducedBy} />
                            </RailCard>
                        )}

                        {subject.nonAgendaReason !== 'beforeAgenda' && !subject.withdrawn && (
                            <RailCard
                                title={decision ? (
                                    <span className="flex flex-wrap items-center gap-2">
                                        {t("decision")}
                                        {decision.ada && (
                                            <Badge variant="secondary" className="text-[10px]">{`ΑΔΑ: ${decision.ada}`}</Badge>
                                        )}
                                    </span>
                                ) : t("decision")}
                            >
                        {decision ? (
                            <div className="space-y-3">
                                {/* Stacked, not a table: a label column beside a long Diavgeia
                                    title in a 316px rail broke the title one word per line. The
                                    ΑΔΑ already sits in the card's own head. */}
                                {decision.title && (
                                    <p className="text-[12.5px] leading-relaxed text-foreground/85">{decision.title}</p>
                                )}
                                <dl className="space-y-1.5 text-xs">
                                    {decision.decisionNumber && (
                                        <div className="flex items-baseline justify-between gap-3">
                                            <dt className="shrink-0 text-muted-foreground">{t("decisionNumber")}</dt>
                                            <dd className="text-right tabular-nums">{decision.decisionNumber}</dd>
                                        </div>
                                    )}
                                    {decision.protocolNumber && (
                                        <div className="flex items-baseline justify-between gap-3">
                                            <dt className="shrink-0 text-muted-foreground">{t("protocolNumber")}</dt>
                                            <dd className="text-right tabular-nums">{decision.protocolNumber}</dd>
                                        </div>
                                    )}
                                    {decision.publishDate && (
                                        <div className="flex items-baseline justify-between gap-3">
                                            <dt className="shrink-0 text-muted-foreground">{t("publishDate")}</dt>
                                            <dd className="text-right">{formatDate(new Date(decision.publishDate))}</dd>
                                        </div>
                                    )}
                                </dl>
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-2.5">
                                    <a
                                        href={decision.pdfUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--orange-deep))] hover:underline"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                        {t("viewDecision")}
                                    </a>
                                    {decision.updatedAt && (
                                        // Clock-relative text — see formatRelativeTime.
                                        <span className="text-[10.5px] text-muted-foreground" suppressHydrationWarning>
                                            {t("lastUpdated", { time: formatRelativeTime(new Date(decision.updatedAt), locale) })}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 pt-1 text-center">
                                <p className="text-sm text-muted-foreground">{t("noDecisionDescription")}</p>
                                {isFetchingDecision ? (
                                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {t("searchingDecision")}
                                    </div>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleFetchDecision}
                                    >
                                        <Landmark className="w-4 h-4 mr-2" />
                                        {t("fetchDecision")}
                                    </Button>
                                )}
                                {lastSearchedAt && !isFetchingDecision && (
                                    <p className="text-xs text-muted-foreground">
                                        {t("lastSearched", { time: formatRelativeTime(new Date(lastSearchedAt), locale) })}
                                    </p>
                                )}
                            </div>
                        )}
                            </RailCard>
                        )}

                        {location && (
                            <RailCard title={t("locationCardTitle")}>
                                <div className="h-[150px] overflow-hidden rounded-[10px] border border-border">
                                    <Map
                                        center={location.coordinates ? [location.coordinates.x, location.coordinates.y] : undefined}
                                        zoom={15}
                                        features={mapFeatures}
                                        animateRotation={false}
                                    />
                                </div>
                                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {location.text}
                                </p>
                            </RailCard>
                        )}
                    </aside>
                </div>

                {/* Voting Section (skip for withdrawn subjects; counselors only, hidden from the public) */}
                {!subject.withdrawn && options.editsAllowed && <CollapsibleCard
                    icon={<CheckSquare className="w-4 h-4" />}
                    title={
                        voteResult && voteResult.totalVotes > 0 ? (
                            <span className="flex items-center gap-2">
                                {t("voting")}
                                <Badge variant="secondary" className="text-xs">
                                    {voteResult.isUnanimous
                                        ? t("unanimous", { count: voteResult.forCount })
                                        : voteResult.passed
                                            ? t("majorityVote", { for: voteResult.forCount, against: voteResult.againstCount })
                                            : t("rejected", { against: voteResult.againstCount, for: voteResult.forCount })}
                                    {!voteResult.isUnanimous && voteResult.abstainCount > 0 &&
                                        `, ${voteResult.abstainCount} ${t("voteAbstain")}`}
                                </Badge>
                            </span>
                        ) : t("voting")
                    }
                    defaultOpen={false}
                >
                    <VotingSection subjectId={subject.id} votes={subject.votes} attendance={subject.attendance} />
                </CollapsibleCard>}

                {/* Admin Section - internal signals, only for users authorized to edit */}
                {options.editsAllowed && (topicImportance || proximityImportance) && (
                    <CollapsibleCard
                        icon={<ScrollText className="w-4 h-4" />}
                        title={t("adminDetails")}
                    >
                        <div className="p-4 space-y-4">
                            {/* Notification Importance */}
                            <div className="space-y-2">
                                <div className="text-sm font-medium">{t("notificationImportance")}</div>
                                <p className="text-xs text-muted-foreground">
                                    {t("notificationImportanceDescription")}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {topicImportance && (
                                        <Badge variant="secondary">
                                            {t("topicImportanceLabel")}: {t(`topicImportance.${topicImportance}`)}
                                        </Badge>
                                    )}
                                    {proximityImportance && (
                                        <Badge variant="secondary">
                                            {t("proximityImportanceLabel")}: {t(`proximityImportance.${proximityImportance}`)}
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            {/* Debug Utterances - Superadmin only */}
                            <DebugUtterances subjectId={subject.id} />
                        </div>
                    </CollapsibleCard>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* The redesigned page's small pieces                                  */
/* ------------------------------------------------------------------ */

/** A section's heading: title, optional count, and the AI notice once — not on every card. */
function SectionHead({ title, count }: { title: string; count?: number }) {
    return (
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 className="!m-0 !text-left text-[15px] font-extrabold tracking-[.01em]">
                {title}
                {count !== undefined && <span className="ml-1.5 font-normal text-muted-foreground">({count})</span>}
            </h2>
            <AIGeneratedBadge />
        </div>
    );
}

/** One quiet card of the facts rail. */
function RailCard({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
            <div className="mb-2.5 text-[11px] font-extrabold tracking-[.04em] text-muted-foreground">{title}</div>
            {children}
        </div>
    );
}

/**
 * The discussion at a glance: the party-split ring around the total, and each
 * party's own minutes as a legend — the old swatch row named the parties but
 * not how long each actually held the floor.
 */
function DiscussionStats({
    statistics,
    totalMinutes,
    colorPercentages,
    locale,
    compact = false,
}: {
    statistics: Statistics | undefined;
    totalMinutes: number;
    colorPercentages: { color: string; percentage: number }[];
    locale: string;
    compact?: boolean;
}) {
    const t = useTranslations("Subject");
    const parties = [...(statistics?.parties ?? [])].sort((a, b) => b.speakingSeconds - a.speakingSeconds);
    const speakerCount = statistics?.people?.length ?? 0;

    return (
        <div>
            <div className="flex items-center gap-4">
                <ColorPercentageRing data={colorPercentages} size={compact ? 64 : 84} thickness={compact ? 9 : 11}>
                    <div className="flex flex-col items-center">
                        <div className={compact ? "text-base font-semibold leading-none" : "text-xl font-semibold leading-none"}>
                            {totalMinutes}′
                        </div>
                        <div className="mt-0.5 text-[9px] text-muted-foreground">{t("minutes")}</div>
                    </div>
                </ColorPercentageRing>
                <div className="min-w-0 flex-1">
                    {parties.map(p => (
                        <div key={p.item.id} className="flex items-center gap-2 py-[3px] text-[11.5px]">
                            <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ backgroundColor: p.item.colorHex }} aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{getLocalizedName(p.item, locale)}</span>
                            <span className="tabular-nums text-muted-foreground">{Math.round(p.speakingSeconds / 60)}′</span>
                        </div>
                    ))}
                </div>
            </div>
            {!compact && speakerCount > 0 && (
                <div className="mt-2.5 border-t border-border pt-2.5 text-[11.5px] text-muted-foreground">
                    {t("speakers", { count: speakerCount })}
                    {statistics?.parties?.length ? <> · {t("partiesCount", { count: statistics.parties.length })}</> : null}
                </div>
            )}
        </div>
    );
}
