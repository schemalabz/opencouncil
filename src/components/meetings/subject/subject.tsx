"use client";
import Map from "@/components/map/map";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import TopicBadge from "../transcript/Topic";
import { useVideo } from "../VideoProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, FileText, MapPin, ScrollText, CheckSquare, Landmark, ExternalLink, Loader2 } from "lucide-react";
import { PersonBadge } from "@/components/persons/PersonBadge";
import { Link } from "@/i18n/routing";
import { ColorPercentageRing } from "@/components/ui/color-percentage-ring";
import Icon from "@/components/icon";
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
import { AutoScrollText } from "@/components/ui/auto-scroll-text";
import { formatDate, formatRelativeTime } from "@/lib/formatters/time";
import { useTranslations, useLocale } from "next-intl";
import { requestPollDecisionForSubject, getLastPollTimeForMeeting, getDecisionForSubject } from "@/lib/tasks/pollDecisions";
import { useSession } from "next-auth/react";
import { DebugMetadataButton } from "@/components/ui/debug-metadata-button";

export default function Subject({ subjectId }: { subjectId?: string }) {
    const { subjects, getSpeakerTag, getPerson, getParty, meeting } = useCouncilMeetingData();
    const { seekToAndPlay } = useVideo();
    const t = useTranslations("Subject");
    const locale = useLocale();
    const { data: session } = useSession();
    const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
    const [isFetchingDecision, setIsFetchingDecision] = useState(false);
    const [localDecision, setLocalDecision] = useState<{
        ada: string | null;
        protocolNumber: string | null;
        title: string | null;
        pdfUrl: string;
        issueDate: string | null;
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

    // The effective decision: local override (from polling) or server-rendered
    const decision = localDecision || subject.decision;

    // Fetch last poll time on mount when there's no decision
    useEffect(() => {
        if (agendaItemIndex != null && !subject.decision) {
            getLastPollTimeForMeeting(meeting.id, meeting.cityId).then(setLastSearchedAt);
        }
    }, [agendaItemIndex, subject.decision, meeting.id, meeting.cityId]);

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
            {/* Sticky Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
                <div className="max-w-4xl mx-auto px-3 py-3.5 md:px-4 md:py-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-full shrink-0" style={{ backgroundColor: topic?.colorHex ? topic.colorHex + "20" : "#e5e7eb" }}>
                            <Icon name={topic?.icon as any || "Hash"} color={topic?.colorHex || "#9ca3af"} size={24} />
                        </div>
                        <div className="flex-grow min-w-0">
                            <AutoScrollText className="mb-1.5">
                                <h1 className="text-xl font-semibold leading-tight">{name}</h1>
                            </AutoScrollText>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {topic && <TopicBadge topic={topic} size="compact" />}
                                {agendaItemIndex ? (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                                        <span className="font-medium">{t("agendaItem", { index: agendaItemIndex })}</span>
                                        {decision && (
                                            <a
                                                href="#decision"
                                                className="inline-flex items-center gap-1 text-primary hover:underline"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    history.replaceState(null, '', '#decision');
                                                    window.dispatchEvent(new HashChangeEvent('hashchange'));
                                                }}
                                            >
                                                <Landmark className="w-3 h-3" />
                                                {decision.protocolNumber && (
                                                    <span className="font-medium">{decision.protocolNumber}</span>
                                                )}
                                            </a>
                                        )}
                                    </>
                                ) : subject.nonAgendaReason && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                                        <span className="font-medium">
                                            {subject.nonAgendaReason === 'beforeAgenda' ? "Προ ημερησίας" : "Εκτός ημερησίας"}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                        {isSuperAdmin && (
                            <div className="flex-shrink-0">
                                <DebugMetadataButton
                                    data={subject}
                                    title="Subject Metadata"
                                    tooltip="View subject metadata"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-4xl mx-auto px-3 py-4 md:px-4 md:py-6 space-y-6">
                {/* Quick Stats Section */}
                <div className="flex flex-col md:flex-row gap-3 md:gap-4">
                    {/* Parties Card */}
                    <div className="flex-grow rounded-lg shadow-sm overflow-hidden">
                        <div
                            className="w-full h-full rounded-lg p-[1.5px] bg-gradient-to-r from-gray-300/40 via-gray-200/30 to-gray-300/40"
                            style={{ borderRadius: "0.5rem" }}
                        >
                            <div className="w-full h-full bg-card overflow-hidden p-3 md:p-4" style={{ borderRadius: "calc(0.5rem - 1.5px)" }}>
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
                    </div>

                    {/* Introducer Card */}
                    {introducedBy && (
                        <div className="shrink-0 rounded-lg shadow-sm overflow-hidden md:max-w-[66%]">
                            <div
                                className="w-full h-full rounded-lg p-[1.5px] bg-gradient-to-r from-gray-300/40 via-gray-200/30 to-gray-300/40"
                                style={{ borderRadius: "0.5rem" }}
                            >
                                <div className="w-full h-full bg-card overflow-hidden p-3 md:p-4" style={{ borderRadius: "calc(0.5rem - 1.5px)" }}>
                                    <h3 className="text-sm font-semibold mb-2">{t("introducer")}</h3>
                                    <PersonBadge person={introducedBy} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Grouped Discussion Notice */}
                {discussedIn && (
                    <GroupedDiscussionNotice primarySubject={discussedIn} />
                )}

                {/* Summary Section (Collapsible - Open by default) */}
                {description && (
                    <CollapsibleCard
                        icon={<FileText className="w-4 h-4" />}
                        title={t("summary")}
                        defaultOpen={true}
                    >
                        <div className="p-4 space-y-4">
                            <div className="text-justify">
                                <FormattedTextDisplay
                                    text={description}
                                    meetingId={meeting.id}
                                    cityId={meeting.cityId}
                                    linkColor="black"
                                />
                            </div>
                            <div className="flex justify-end">
                                <AIGeneratedBadge />
                            </div>
                        </div>
                    </CollapsibleCard>
                )}

                {/* Location & Map Section (Collapsible) */}
                {location && (
                    <CollapsibleCard
                        icon={<MapPin className="w-4 h-4" />}
                        title={location.text}
                    >
                        <div className="h-[300px] w-full">
                            <Map
                                center={location.coordinates ? [location.coordinates.y, location.coordinates.x] : undefined}
                                zoom={15}
                                features={mapFeatures}
                                animateRotation={false}
                            />
                        </div>
                    </CollapsibleCard>
                )}

                {/* Context Section */}
                {subject.context && (
                    <SubjectContext subject={subject} />
                )}

                {/* Speaker Contributions OR Speaker Segments */}
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
                                        <ContributionCard contribution={contribution} subjectId={subject.id} />
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

                {/* Voting Section */}
                <CollapsibleCard
                    icon={<CheckSquare className="w-4 h-4" />}
                    title={t("voting")}
                    defaultOpen={false}
                >
                    <VotingSection subjectId={subject.id} />
                </CollapsibleCard>

                {/* Decision Section */}
                {agendaItemIndex != null && (
                    <CollapsibleCard
                        id="decision"
                        icon={<Landmark className="w-4 h-4" />}
                        title={
                            decision ? (
                                <span className="flex items-center gap-2">
                                    {t("decision")}
                                    <Badge variant="secondary" className="text-xs">
                                        {decision.ada ? `ΑΔΑ: ${decision.ada}` : t("decision")}
                                    </Badge>
                                </span>
                            ) : (
                                <span className="text-muted-foreground">{t("noDecision")}</span>
                            )
                        }
                    >
                        {decision ? (
                            <div className="p-4 space-y-3">
                                <table className="w-full text-sm">
                                    <tbody>
                                        {decision.title && (
                                            <tr>
                                                <td className="py-1.5 pr-4 text-muted-foreground font-medium whitespace-nowrap align-top">{t("decisionTitle")}</td>
                                                <td className="py-1.5">{decision.title}</td>
                                            </tr>
                                        )}
                                        {decision.ada && (
                                            <tr>
                                                <td className="py-1.5 pr-4 text-muted-foreground font-medium whitespace-nowrap">ΑΔΑ</td>
                                                <td className="py-1.5">{decision.ada}</td>
                                            </tr>
                                        )}
                                        {decision.protocolNumber && (
                                            <tr>
                                                <td className="py-1.5 pr-4 text-muted-foreground font-medium whitespace-nowrap">{t("protocolNumber")}</td>
                                                <td className="py-1.5">{decision.protocolNumber}</td>
                                            </tr>
                                        )}
                                        {decision.issueDate && (
                                            <tr>
                                                <td className="py-1.5 pr-4 text-muted-foreground font-medium whitespace-nowrap">{t("issueDate")}</td>
                                                <td className="py-1.5">{formatDate(new Date(decision.issueDate))}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                <div className="flex items-center justify-between pt-2 border-t border-border">
                                    <a
                                        href={decision.pdfUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        {t("viewDecision")}
                                    </a>
                                    {decision.updatedAt && (
                                        <span className="text-xs text-muted-foreground">
                                            {t("lastUpdated", { time: formatRelativeTime(new Date(decision.updatedAt), locale) })}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="p-6 text-center space-y-3">
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
                    </CollapsibleCard>
                )}

                {/* Admin Section */}
                {(topicImportance || proximityImportance) && (
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