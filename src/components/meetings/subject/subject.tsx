"use client";
import Map from "@/components/map/map";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { useVideo } from "../VideoProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, FileText, MapPin, ScrollText, CheckSquare, Landmark, ExternalLink, Loader2, ArrowLeft, ChevronDown, Globe } from "lucide-react";
import { PersonBadge } from "@/components/persons/PersonBadge";
import { Link } from "@/i18n/routing";
import { ColorPercentageRing } from "@/components/ui/color-percentage-ring";
import { subjectToMapFeature, cn } from "@/lib/utils";
import { notFound } from "next/navigation";
import { SubjectContext, hasSubjectContext } from "./context";
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
import { formatSurnameFirst } from "@/lib/formatters/name";
import { useTranslations, useLocale } from "next-intl";
import { requestPollDecisionForSubject, getLastPollTimeForMeeting, getDecisionForSubject } from "@/lib/tasks/pollDecisions";
import { useSubjectHeader } from "@/contexts/SubjectHeaderContext";
import { useSession } from "next-auth/react";
import { getWithdrawnLabel } from "@/lib/utils/subjects";
import { SubjectAdminControls } from "./SubjectAdminControls";
import { useTranscriptOptions } from "../options/OptionsContext";

export default function Subject({ subjectId }: { subjectId?: string }) {
    const { subjects, getSpeakerTag, getPerson, getParty, meeting, city } = useCouncilMeetingData();
    const { seekToAndPlay } = useVideo();
    const t = useTranslations("Subject");
    const locale = useLocale();
    const { setSubjectHeader } = useSubjectHeader();
    const { data: session } = useSession();
    const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
    const { options } = useTranscriptOptions();
    const [isFetchingDecision, setIsFetchingDecision] = useState(false);
    const [localDecision, setLocalDecision] = useState<{
        ada: string | null;
        protocolNumber: string | null;
        title: string | null;
        pdfUrl: string;
        publishDate: string | null;
        updatedAt: string | null;
    } | null>(null);
    const [lastSearchedAt, setLastSearchedAt] = useState<string | null>(null);
    // Inline "want to know more" reveal for the AI internet-context, below the summary.
    const [showMoreContext, setShowMoreContext] = useState(false);

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
        speakerSegments,
        agendaItemIndex,
        introducedBy,
        contributions,
        topicImportance,
        proximityImportance,
        discussedIn
    } = subject;

    // Use contributions if available, fallback to speaker segments
    const hasContributions = contributions && contributions.length > 0;

    const colorPercentages = subject.statistics?.parties?.map(p => ({
        color: p.item.colorHex,
        percentage: (p.speakingSeconds / subject.statistics!.speakingSeconds) * 100
    })) || [];

    const totalMinutes = Math.round(subject.statistics?.speakingSeconds ? subject.statistics.speakingSeconds / 60 : 0);

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

    // Voter names grouped by vote type, for the compact tallies in the overview.
    const voterNames = useMemo(() => {
        const groups: Record<'FOR' | 'AGAINST' | 'ABSTAIN', string[]> = { FOR: [], AGAINST: [], ABSTAIN: [] };
        for (const v of subject.votes ?? []) {
            if (v.voteType === 'FOR' || v.voteType === 'AGAINST' || v.voteType === 'ABSTAIN') {
                groups[v.voteType].push(formatSurnameFirst(v.person.name));
            }
        }
        return groups;
    }, [subject.votes]);

    // The effective decision: local override (from polling) or server-rendered
    const decision = localDecision || subject.decision;

    // Administrative body (όργανο) shown as the page subtitle, e.g. "Δημοτικό Συμβούλιο".
    const adminBodyName = meeting.administrativeBody
        ? (locale === 'en' ? meeting.administrativeBody.name_en : meeting.administrativeBody.name)
        : null;

    // Decision is relevant for the same subjects as before: skip beforeAgenda and withdrawn.
    const showDecision = subject.nonAgendaReason !== 'beforeAgenda' && !subject.withdrawn;

    // Whether there is AI "information from the internet" to reveal below the summary.
    const subjectHasContext = hasSubjectContext(subject);

    // Push subject info to the header breadcrumb
    useEffect(() => {
        setSubjectHeader({
            name,
            topicIcon: topic?.icon ?? undefined,
            topicColor: topic?.colorHex ?? undefined,
        });
        return () => setSubjectHeader(null);
    }, [name, topic?.icon, topic?.colorHex, setSubjectHeader]);

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
            <div className="max-w-4xl mx-auto px-3 py-4 md:px-4 md:py-6 space-y-6">
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
                        aria-label={t("backToMeetingNamed", { meeting: meeting.name })}
                        className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{meeting.name}</span>
                    </Link>
                    <span className="text-muted-foreground" aria-hidden="true">·</span>
                    <Link
                        href={`/${meeting.cityId}`}
                        className="text-muted-foreground hover:text-primary transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        {city.name}
                    </Link>
                    <span className="text-muted-foreground">
                        {formatDate(new Date(meeting.dateTime), undefined, locale)}
                    </span>
                </nav>
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
                        {getWithdrawnLabel(subject, 'long')}
                    </div>
                )}

                <div className="flex flex-col gap-4 md:gap-10">
                    {/* Title + subtitle (the administrative body / όργανο) */}
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{name}</h1>
                        {adminBodyName && (
                            <p className="text-sm md:text-base text-muted-foreground">{adminBodyName}</p>
                        )}
                    </div>

                    <div className="flex flex-col gap-4">
                        {/* Location map — rendered directly, only when a location is available */}
                        {location && (
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                                    <MapPin className="w-4 h-4 shrink-0" />
                                    <span>{location.text}</span>
                                </div>
                                <div className="h-[300px] w-full overflow-hidden rounded-lg border border-border shadow-sm">
                                    <Map
                                        center={location.coordinates ? [location.coordinates.y, location.coordinates.x] : undefined}
                                        zoom={15}
                                        features={mapFeatures}
                                        animateRotation={false}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                            <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">
                                {/* Εισηγητής (above) + Παρατάξεις */}
                                <div className="flex-1 min-w-0 p-3 md:p-4 space-y-3">
                                    {introducedBy && (
                                        <div>
                                            <h3 className="text-sm font-semibold mb-1.5">{t("introducer")}</h3>
                                            <PersonBadge person={introducedBy} size="sm" />
                                        </div>
                                    )}
                                    <div>
                                        <h3 className="text-sm font-semibold mb-2">{t("parties")}</h3>
                                        {totalMinutes === 0 ? (
                                            <div className="py-6 text-center">
                                                <p className="text-sm text-muted-foreground">
                                                    {t("noDiscussionFound")}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="flex items-start gap-3">
                                                {/* Color Ring */}
                                                <div className="flex-shrink-0">
                                                    <ColorPercentageRing
                                                        data={colorPercentages}
                                                        size={80}
                                                        thickness={10}
                                                    >
                                                        <div className="flex flex-col items-center">
                                                            <div className="text-xl font-semibold">
                                                                {totalMinutes}
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground">
                                                                {t("minutes")}
                                                            </div>
                                                        </div>
                                                    </ColorPercentageRing>
                                                </div>

                                                {/* Party Breakdown + Speaker Count */}
                                                <div className="flex-grow min-w-0 space-y-2">
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                                        {subject.statistics?.parties?.map((p) => (
                                                            <div key={p.item.id} className="flex items-center gap-1.5 text-xs">
                                                                <div
                                                                    className="w-3 h-3 rounded-sm shrink-0"
                                                                    style={{ backgroundColor: p.item.colorHex }}
                                                                />
                                                                <span className="font-medium">{p.item.name}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <span>{t("speakers", { count: subject.statistics?.people?.length || (hasContributions ? contributions.length : speakerSegments?.length || 0) })}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Απόφαση — full details shown inline, with the Diavgeia link */}
                                {showDecision && (
                                    <div className="flex-1 min-w-0 p-3 md:p-4">
                                        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                                            <Landmark className="w-4 h-4 text-primary" />
                                            {t("decision")}
                                        </h3>
                                        {decision ? (
                                            <div className="space-y-2 text-sm">
                                                {decision.title && (
                                                    <p className="font-medium">{decision.title}</p>
                                                )}
                                                <dl className="space-y-1 text-xs">
                                                    {decision.ada && (
                                                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                                            <dt className="text-muted-foreground font-medium shrink-0">ΑΔΑ</dt>
                                                            <dd className="min-w-0 break-all">{decision.ada}</dd>
                                                        </div>
                                                    )}
                                                    {decision.protocolNumber && (
                                                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                                            <dt className="text-muted-foreground font-medium shrink-0">{t("protocolNumber")}</dt>
                                                            <dd className="min-w-0 break-words">{decision.protocolNumber}</dd>
                                                        </div>
                                                    )}
                                                    {decision.publishDate && (
                                                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                                            <dt className="text-muted-foreground font-medium shrink-0">{t("publishDate")}</dt>
                                                            <dd className="min-w-0 break-words">{formatDate(new Date(decision.publishDate))}</dd>
                                                        </div>
                                                    )}
                                                </dl>
                                                <a
                                                    href={decision.pdfUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 text-xs text-primary underline"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    {t("viewDecision")}
                                                </a>
                                                {decision.updatedAt && (
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("lastUpdated", { time: formatRelativeTime(new Date(decision.updatedAt), locale) })}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <p className="text-xs text-muted-foreground">{t("noDecisionDescription")}</p>
                                                {isFetchingDecision ? (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                                    </div>
                                )}

                                {/* Ψηφοφορία — vote tallies with the names that fit; "Read more"
                            scrolls to and opens the voting accordion (#voting). */}
                                {!subject.withdrawn && (
                                    <div className="flex-1 min-w-0 p-3 md:p-4">
                                        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                                            <CheckSquare className="w-4 h-4 text-primary" />
                                            {t("voting")}
                                        </h3>
                                        {voteResult && voteResult.totalVotes > 0 ? (
                                            <div className="space-y-1.5">
                                                <Badge variant="secondary" className="text-xs">
                                                    {voteResult.isUnanimous
                                                        ? t("unanimousVerdict")
                                                        : voteResult.passed
                                                            ? t("majorityVerdict")
                                                            : t("rejectedVerdict")}
                                                </Badge>
                                                <dl className="space-y-1 text-xs">
                                                    {voteResult.forCount > 0 && (
                                                        <div className="min-w-0">
                                                            <dt className="font-medium inline">{t("voteFor")}: {voteResult.forCount}</dt>
                                                            {voterNames.FOR.length > 0 && (
                                                                <dd className="text-muted-foreground truncate">{voterNames.FOR.join(', ')}</dd>
                                                            )}
                                                        </div>
                                                    )}
                                                    {voteResult.againstCount > 0 && (
                                                        <div className="min-w-0">
                                                            <dt className="font-medium inline">{t("voteAgainst")}: {voteResult.againstCount}</dt>
                                                            {voterNames.AGAINST.length > 0 && (
                                                                <dd className="text-muted-foreground truncate">{voterNames.AGAINST.join(', ')}</dd>
                                                            )}
                                                        </div>
                                                    )}
                                                    {voteResult.abstainCount > 0 && (
                                                        <div className="min-w-0">
                                                            <dt className="font-medium inline">{t("voteAbstain")}: {voteResult.abstainCount}</dt>
                                                            {voterNames.ABSTAIN.length > 0 && (
                                                                <dd className="text-muted-foreground truncate">{voterNames.ABSTAIN.join(', ')}</dd>
                                                            )}
                                                        </div>
                                                    )}
                                                </dl>
                                                <a href="#voting" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                                    {t("readMore")}
                                                </a>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">{t("noVotingUtterances")}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>


                    {/* Grouped Discussion Notice */}
                    {discussedIn && (
                        <GroupedDiscussionNotice primarySubject={discussedIn} />
                    )}

                    {/* Summary — always visible, blockquote style, with an AI note and an
                    optional "want to know more" reveal for the AI internet-context. */}
                    {description && (
                        <div className="space-y-3">
                            <h2 className="!text-left text-lg font-semibold text-foreground">{t("summary")}</h2>
                            <blockquote className="border-l-4 border-muted pl-4 text-justify italic text-muted-foreground">
                                <FormattedTextDisplay
                                    text={description}
                                    meetingId={meeting.id}
                                    cityId={meeting.cityId}
                                    linkColor="black"
                                />
                            </blockquote>
                            <AIGeneratedBadge className="italic" />

                            {subjectHasContext && (
                                <div className="pt-1">
                                    <button
                                        onClick={() => setShowMoreContext(v => !v)}
                                        aria-expanded={showMoreContext}
                                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                                    >
                                        <Globe className="w-3.5 h-3.5" />
                                        {showMoreContext ? t("showLess") : t("wantToKnowMore")}
                                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showMoreContext && "rotate-180")} />
                                    </button>
                                    {showMoreContext && (
                                        <div className="mt-2 rounded-lg border border-border bg-card">
                                            <SubjectContext subject={subject} variant="inline" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Speaker Contributions OR Speaker Segments */}
                    <div className="space-y-3">
                        <h2 className="!text-left text-lg font-semibold text-foreground">{t("speakersAndStatements")}</h2>
                        <CollapsibleCard
                            icon={<ScrollText className="w-4 h-4" />}
                            title={`${t("statements")} (${hasContributions ? contributions.length : speakerSegments?.length || 0})`}
                            defaultOpen={true}
                        >
                            {hasContributions ? (
                                /* NEW: Render Contributions */
                                contributions.length === 0 ? (
                                    <div className="p-8 text-center">
                                        <p className="text-sm text-muted-foreground">
                                            {t("noStatements")}
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        {contributions.map((contribution, index) => (
                                            <div key={contribution.id}>
                                                {index > 0 && <div className="border-t border-border" />}
                                                <ContributionCard
                                                    contribution={contribution}
                                                    subjectId={subject.id}
                                                    meeting={meeting}
                                                    speaker={contribution.speakerId ? getPerson(contribution.speakerId) ?? null : null}
                                                />
                                            </div>
                                        ))}
                                    </>
                                )
                            ) : (
                                /* FALLBACK: Render Speaker Segments (old format) */
                                (!speakerSegments || speakerSegments.length === 0) ? (
                                    <div className="p-8 text-center">
                                        <p className="text-sm text-muted-foreground">
                                            {t("noStatements")}
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        {speakerSegments.map((segment, index) => {
                                            const speakerTag = getSpeakerTag(segment.speakerSegment.speakerTagId);
                                            const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
                                            if (!speakerTag) return null;

                                            const timeParam = `t=${Math.floor(segment.speakerSegment.startTimestamp)}`;
                                            const transcriptUrl = `/${meeting.cityId}/${meeting.id}/transcript?${timeParam}`;

                                            return (
                                                <div key={segment.speakerSegmentId}>
                                                    {index > 0 && <div className="border-t border-border" />}
                                                    <div className="p-4">
                                                        <div className="flex flex-col md:flex-row md:items-center gap-4">
                                                            <PersonBadge
                                                                person={person}
                                                                speakerTag={speakerTag}
                                                            />
                                                            <div className="flex gap-2 md:ml-auto">
                                                                <Button
                                                                    onClick={() => seekToAndPlay(segment.speakerSegment.startTimestamp)}
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="transition-colors hover:bg-primary hover:text-primary-foreground"
                                                                >
                                                                    <Play className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    asChild
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="transition-colors hover:bg-primary hover:text-primary-foreground"
                                                                >
                                                                    <Link href={transcriptUrl}>
                                                                        <FileText className="h-4 w-4 mr-1.5" />
                                                                        {t("transcript")}
                                                                    </Link>
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        {segment.summary ? (
                                                            <div className="mt-4 pl-4 border-l-2 border-muted">
                                                                <p className="text-sm text-muted-foreground leading-relaxed">{segment.summary}</p>
                                                            </div>
                                                        ) : (
                                                            <p className="text-center text-sm mt-6 text-muted-foreground italic">
                                                                {t("noSummary")}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )
                            )}
                        </CollapsibleCard>
                    </div>

                    {/* Voting Section (skip for withdrawn subjects). The overview voting
                    result links here via #voting, which auto-opens this card. */}
                    {!subject.withdrawn && <CollapsibleCard
                        id="voting"
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
        </div>
    );
}