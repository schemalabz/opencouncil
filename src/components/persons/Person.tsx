"use client";
import { useLocale, useTranslations } from 'next-intl';
import { City, Party, AdministrativeBody, Topic } from '@prisma/client';
import { Button } from '../ui/button';
import FormSheet from '../FormSheet';
import PersonForm from './PersonForm';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Search, ExternalLink, FileText } from "lucide-react";
import { Input } from '../ui/input';
import { useState, useEffect, useMemo } from 'react';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Link } from '@/i18n/routing';
import { Statistics } from "@/lib/statistics";
import { getLatestContributionsForSpeaker } from '@/lib/db/contributions';
import { ContributionForPerson } from '@/lib/db/types';
import { ContributionCard, ContributionCardSkeleton } from '@/components/meetings/subject/ContributionCard';
import { isUserAuthorizedToEdit } from '@/lib/actions/auth';
import { motion } from 'framer-motion';
import { ImageOrInitials } from '@/components/ImageOrInitials';
import { PersonWithRelations } from '@/lib/db/people';
import { cn, filterActiveRoles, filterInactiveRoles, formatDateRange, getRoleText } from '@/lib/utils';
import { TopicFilter } from '@/components/TopicFilter';
import { RoleWithRelations } from '@/lib/db/types';
import { useSession } from 'next-auth/react';
import { DebugMetadataButton } from '../ui/debug-metadata-button';
import { AdminStrip, adminToolClass } from '@/components/admin/AdminStrip';
import { RailCard } from '@/components/ui/rail-card';
import { AIGeneratedBadge } from '@/components/AIGeneratedBadge';
import Icon from '@/components/icon';
import { Star, Landmark, ChevronDown } from 'lucide-react';
import { getPartyFromRoles } from '@/lib/utils';
import { getLocalizedName } from '@/lib/formatters/name';
import { topicStyle } from '@/lib/topicStyle';

export default function PersonC({ city, person, parties, administrativeBodies, statistics, contributionTopics }: {
    city: City,
    person: PersonWithRelations,
    parties: Party[],
    administrativeBodies: AdministrativeBody[],
    statistics: Statistics,
    contributionTopics: Topic[],
}) {
    const t = useTranslations('Person');
    const tCommon = useTranslations('Common');
    const tCity = useTranslations('City');
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [contributions, setContributions] = useState<ContributionForPerson[]>([]);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [canEdit, setCanEdit] = useState(false);
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [isLoadingContributions, setIsLoadingContributions] = useState(false);
    const { data: session } = useSession();
    const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
    const locale = useLocale();
    const activeRoles = filterActiveRoles(person.roles as RoleWithRelations[]);
    const personParty = getPartyFromRoles(person.roles);
    const speakingMinutes = Math.round((statistics?.speakingSeconds ?? 0) / 60);
    const inactiveRoles = filterInactiveRoles(person.roles as RoleWithRelations[]);
    const topTopics = useMemo(
        () => (statistics?.topics ?? [])
            .filter(stat => stat.speakingSeconds > 0)
            .sort((a, b) => b.speakingSeconds - a.speakingSeconds)
            .slice(0, 5),
        [statistics],
    );

    // Topic chips reflect the actual contributions list (already sorted server-side).
    const relevantTopics = contributionTopics;

    // Check if person is an independent council member
    const isIndependentCouncilMember = useMemo(() => {
        const activeRoles = filterActiveRoles(person.roles as RoleWithRelations[]);
        const partyRoles = activeRoles.filter(role => role.partyId);

        if (partyRoles.length > 0) return false;

        return activeRoles.some(role =>
            role.administrativeBodyId && role.administrativeBody?.type === 'council'
        );
    }, [person.roles]);

    useEffect(() => {
        const checkEditPermissions = async () => {
            const hasPermission = await isUserAuthorizedToEdit({ personId: person.id });
            setCanEdit(hasPermission);
        };
        checkEditPermissions();
    }, [person.id]);

    useEffect(() => {
        const fetchLatestContributions = async () => {
            try {
                setIsLoadingContributions(true);
                setContributions([]);
                const { results, totalCount } = await getLatestContributionsForSpeaker(
                    person.id,
                    1,
                    5,
                    selectedTopicId,
                );
                setContributions(results);
                setTotalCount(totalCount);
                setPage(1);
            } catch (error) {
                console.error('Error fetching contributions:', error);
            } finally {
                setIsLoadingContributions(false);
            }
        };
        fetchLatestContributions();
    }, [person.id, selectedTopicId]);

    useEffect(() => {
        const loadMoreContributions = async () => {
            if (page === 1) return;
            try {
                setIsLoadingContributions(true);
                const { results } = await getLatestContributionsForSpeaker(
                    person.id,
                    page,
                    5,
                    selectedTopicId,
                );
                setContributions(prev => [...prev, ...results]);
            } catch (error) {
                console.error('Error loading more contributions:', error);
            } finally {
                setIsLoadingContributions(false);
            }
        };
        loadMoreContributions();
    }, [person.id, page, selectedTopicId]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        params.set('query', searchQuery);
        params.set('personId', person.id);
        router.push(`/search?${params.toString()}`);
    };

    const onDelete = async () => {
        try {
            const response = await fetch(`/api/cities/${city.id}/people/${person.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast({
                    title: t('personDeleted', { name: person.name }),
                });
                router.push(`/${city.id}`);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete person');
            }
        } catch (error) {
            console.error('Error deleting person:', error);
            toast({
                title: error instanceof Error ? error.message : 'An unexpected error occurred',
                variant: 'destructive'
            });
        }
    }

    // Handler for topic selection
    const handleTopicSelect = (topicId: string | null) => {
        setSelectedTopicId(topicId);
    };

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-4 sm:py-6 lg:py-8 space-y-6 sm:space-y-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-6 sm:space-y-8"
                >
                    {/* Breadcrumb */}
                    <Breadcrumb className="mb-4 sm:mb-6">
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <Link href="/">{t('breadcrumbHome')}</Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <Link href={`/${city.id}`}>{city.name}</Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <Link href={`/${city.id}/people`}>{tCity('people')}</Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink href={`/${city.id}/persons/${person.id}`}>{person.name}</BreadcrumbLink>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>

                    {/* Identity band: the party-ringed face beside the name, the roles as
                        the app's chip language, and a line of countable facts — the old hero
                        said nothing a reader could compare. Admin controls live in the
                        hazard-striped corner every back-of-house control now uses. */}
                    <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
                        <span className="block h-[84px] w-[84px] shrink-0">
                            <ImageOrInitials
                                imageUrl={person.image}
                                name={person.name}
                                color={personParty?.colorHex}
                                width={84}
                                height={84}
                            />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h1 className="!text-left text-2xl leading-tight tracking-tight sm:text-3xl">{person.name}</h1>
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                {activeRoles.map(role => {
                                    if (role.partyId && role.party) {
                                        const style = topicStyle(role.party.colorHex);
                                        return (
                                            <Link
                                                key={role.id}
                                                href={`/${city.id}/parties/${role.partyId}`}
                                                className="inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-bold hover:no-underline"
                                                style={{ backgroundColor: style.background, borderColor: style.border, color: style.icon }}
                                            >
                                                {role.isHead && <Star className="h-3 w-3 shrink-0" aria-hidden />}
                                                {getLocalizedName(role.party, locale)}
                                                {role.isHead && ` · ${t('partyLeaderShort')}`}
                                            </Link>
                                        );
                                    }
                                    const cityLevel = role.cityId && !role.administrativeBodyId;
                                    return (
                                        <span
                                            key={role.id}
                                            className="inline-flex h-6 items-center gap-1.5 rounded-full bg-muted px-2.5 text-[11.5px] font-bold text-muted-foreground"
                                        >
                                            {cityLevel && role.isHead
                                                ? <Star className="h-3 w-3 shrink-0 text-[hsl(var(--orange-deep))]" aria-hidden />
                                                : <Landmark className="h-3 w-3 shrink-0" aria-hidden />}
                                            {role.name || (role.administrativeBody ? getLocalizedName(role.administrativeBody, locale) : t('member'))}
                                        </span>
                                    );
                                })}
                                {isIndependentCouncilMember && (
                                    <span className="text-sm italic text-muted-foreground">{t('independentCouncilMember')}</span>
                                )}
                            </div>
                            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
                                {totalCount > 0 && <span>{t('statementsFact', { count: totalCount })}</span>}
                                {totalCount > 0 && speakingMinutes > 0 && <span aria-hidden>·</span>}
                                {speakingMinutes > 0 && <span>{t('speakingFact', { minutes: speakingMinutes })}</span>}
                                {person.profileUrl && (
                                    <>
                                        {(totalCount > 0 || speakingMinutes > 0) && <span aria-hidden>·</span>}
                                        <a
                                            href={person.profileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                            {t('biography')}
                                        </a>
                                    </>
                                )}
                            </div>
                        </div>
                        {(canEdit || isSuperAdmin) && (
                            <AdminStrip className="shrink-0 self-start">
                                {canEdit && (
                                    <>
                                        <FormSheet
                                            FormComponent={PersonForm}
                                            formProps={{ person, cityId: person.cityId, parties, administrativeBodies }}
                                            title={t('editPerson')}
                                            type="edit"
                                            triggerVariant="ghost"
                                            triggerSize="sm"
                                            triggerClassName={adminToolClass}
                                        />
                                        <Button variant="ghost" size="sm" onClick={onDelete} className={cn(adminToolClass, 'text-destructive hover:!text-destructive')}>
                                            {t('deletePerson')}
                                        </Button>
                                    </>
                                )}
                                {isSuperAdmin && (
                                    <DebugMetadataButton data={person} title="Person Metadata" tooltip="View person metadata" />
                                )}
                            </AdminStrip>
                        )}
                    </header>

                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_316px] lg:gap-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="relative min-w-0"
                    >
                        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                            <h2 className="!m-0 !text-left text-[15px] font-extrabold tracking-[.01em]">
                                {t('recentContributions')}
                                {totalCount > 0 && <span className="ml-1.5 font-normal text-muted-foreground">({totalCount})</span>}
                            </h2>
                            <AIGeneratedBadge />
                            <form onSubmit={handleSearch} className="relative ml-auto w-full sm:w-[260px]">
                                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                <Input
                                    placeholder={tCommon('search')}
                                    className="h-8 rounded-full pl-9 text-xs"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </form>
                        </div>

                        {relevantTopics.length > 0 && (
                            <TopicFilter 
                                topics={relevantTopics}
                                selectedTopicId={selectedTopicId}
                                onSelectTopic={handleTopicSelect}
                            />
                        )}

                        {isLoadingContributions && contributions.length === 0 ? (
                            <div className="space-y-3 sm:space-y-4" aria-busy>
                                {[0, 1, 2].map(i => <ContributionCardSkeleton key={i} />)}
                            </div>
                        ) : (
                            <div className="space-y-3 sm:space-y-4">
                                {contributions.map((contribution, index) => (
                                    <motion.div
                                        key={contribution.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 * index }}
                                    >
                                        <ContributionCard
                                            contribution={contribution}
                                            subjectId={contribution.subject.id}
                                            meeting={{
                                                id: contribution.subject.councilMeetingId,
                                                cityId: contribution.subject.cityId,
                                            }}
                                            speaker={contribution.speaker}
                                            contextHeader={{
                                                meetingName: contribution.subject.councilMeeting.name,
                                                adminBodyName: contribution.subject.councilMeeting.administrativeBody?.name ?? null,
                                                meetingDate: contribution.subject.councilMeeting.dateTime,
                                                subjectName: contribution.subject.name,
                                                agendaItemIndex: contribution.subject.agendaItemIndex,
                                                nonAgendaReason: contribution.subject.nonAgendaReason,
                                                topic: contribution.subject.topic
                                                    ? {
                                                        name: contribution.subject.topic.name,
                                                        colorHex: contribution.subject.topic.colorHex,
                                                        icon: contribution.subject.topic.icon,
                                                    }
                                                    : null,
                                            }}
                                            showPlayButton={false}
                                            showSpeaker={false}
                                            disableSpeakerNavigation
                                        />
                                    </motion.div>
                                ))}

                                {contributions.length === 0 && !isLoadingContributions && (
                                    <div className="flex flex-col items-center justify-center py-12 px-4 border rounded-lg bg-card/50">
                                        <FileText className="w-8 h-8 sm:w-12 sm:h-12 text-muted-foreground mb-4" />
                                        <div className="text-muted-foreground text-center space-y-2">
                                            <p className="text-sm sm:text-base">{t('noSegmentsFound')}</p>
                                            <p className="text-xs sm:text-sm max-w-md mx-auto">{t('tryDifferentFilter')}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {isLoadingContributions && contributions.length > 0 && (
                            <div className="flex justify-center items-center py-4">
                                <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                            </div>
                        )}

                        {!isLoadingContributions && contributions.length < totalCount && (
                            <Button
                                onClick={() => setPage(prevPage => prevPage + 1)}
                                variant="outline"
                                className="mt-6 w-full sm:w-auto"
                                disabled={isLoadingContributions}
                            >
                                {isLoadingContributions ? (
                                    <>
                                        <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                                        {t('loading')}
                                    </>
                                ) : t('loadMore')}
                            </Button>
                        )}
                    </motion.div>

                    {/* The rail answers the two questions the old page buried: what is
                        this person's seat, and what do they actually talk about. The
                        topic bars use the real per-topic speaking time from statistics —
                        each bar is scaled against the person's own top topic. */}
                    <aside className="min-w-0 space-y-4 lg:pt-[3.25rem]">
                        <RailCard title={t('rolesCard')}>
                            <ul className="space-y-2.5">
                                {activeRoles.map(role => <RoleRow key={role.id} role={role} t={t} />)}
                                {activeRoles.length === 0 && (
                                    <li className="text-sm text-muted-foreground">
                                        {isIndependentCouncilMember ? t('independentCouncilMember') : '—'}
                                    </li>
                                )}
                            </ul>
                            {inactiveRoles.length > 0 && (
                                <details className="group mt-3 border-t border-border pt-3">
                                    <summary className="cursor-pointer list-none text-[12.5px] font-semibold text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                                        {t('pastTerms', { count: inactiveRoles.length })}
                                        <ChevronDown className="ml-1 inline h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
                                    </summary>
                                    <ul className="mt-2.5 space-y-2.5 opacity-70">
                                        {inactiveRoles.map(role => <RoleRow key={role.id} role={role} t={t} />)}
                                    </ul>
                                </details>
                            )}
                        </RailCard>

                        {topTopics.length > 0 && (
                            <RailCard title={t('topTopicsCard')}>
                                <ul className="space-y-3">
                                    {topTopics.map(({ item: topic, speakingSeconds }) => {
                                        const style = topicStyle(topic.colorHex);
                                        const minutes = Math.max(1, Math.round(speakingSeconds / 60));
                                        return (
                                            <li key={topic.id}>
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
                                                        <span className="flex shrink-0" aria-hidden><Icon name={topic.icon ?? 'tag'} size={14} color={style.icon} /></span>
                                                        <span className="truncate">{topic.name}</span>
                                                    </span>
                                                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{minutes}′</span>
                                                </div>
                                                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className="h-full rounded-full"
                                                        style={{
                                                            width: `${Math.max(6, Math.round((speakingSeconds / topTopics[0].speakingSeconds) * 100))}%`,
                                                            backgroundColor: topic.colorHex,
                                                        }}
                                                    />
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </RailCard>
                        )}
                    </aside>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

/**
 * One row of the roles rail: a glyph for the arena the role lives in — the
 * orange star for leading the city, the party's colour dot, a landmark for an
 * administrative body — then the same label the site's role badges render,
 * with the term's dates underneath.
 */
function RoleRow({ role, t }: { role: RoleWithRelations; t: ReturnType<typeof useTranslations> }) {
    const dates = formatDateRange(
        role.startDate ? new Date(role.startDate) : null,
        role.endDate ? new Date(role.endDate) : null,
        t,
    );
    return (
        <li className="flex items-start gap-2">
            {role.party ? (
                <span
                    className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: role.party.colorHex }}
                    aria-hidden
                />
            ) : role.cityId && !role.administrativeBodyId && role.isHead ? (
                <Star className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[hsl(var(--orange-deep))]" aria-hidden />
            ) : (
                <Landmark className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold leading-snug">{getRoleText(role, t)}</span>
                {dates && <span className="block text-[11.5px] text-muted-foreground">{dates}</span>}
            </span>
        </li>
    );
}
