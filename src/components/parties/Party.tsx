'use client';
import { useTranslations } from 'next-intl';
import { captureEvent } from '@/lib/analytics/capture';
import { useState, useEffect, useMemo, useCallback } from 'react';
import FormSheet from '../FormSheet';
import PartyForm from './PartyForm';
import { City, Person, Role, AdministrativeBody, AdministrativeBodyType } from '@prisma/client';
import { ImageOrInitials } from '../ImageOrInitials';
import { Button } from '../ui/button';
import { PartyWithPersons } from '@/lib/db/parties';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Link } from '@/i18n/routing';
import { getLatestContributionsForParty } from '@/lib/db/contributions';
import { ContributionForPerson } from '@/lib/db/types';
import { ContributionCard, ContributionCardSkeleton } from '@/components/meetings/subject/ContributionCard';
import { isUserAuthorizedToEdit } from '@/lib/actions/auth';
import { getAdministrativeBodyTypesForPeople, filterPersonByAdminBodyTypes } from '@/lib/utils/administrativeBodies';
import { motion } from 'framer-motion';
import PersonCard from '../persons/PersonCard';
import { filterActiveRoles, formatDateRange, isRoleActive, getDateRangeFromRoles } from '@/lib/utils';
import { sortPartyMembers, sortInactivePartyMembers } from '@/lib/sorting/people';
import { BadgePicker } from '../ui/badge-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonWithRelations } from '@/lib/db/people';
import PartyMemberRankingSheet from './PartyMemberRankingSheet';
import { AdminStrip, AdminToolButton, adminToolClass } from '@/components/admin/AdminStrip';
import { RailCard, RailMeterRow } from '@/components/ui/rail-card';
import { EntityHeader, FactDot } from '@/components/EntityHeader';
import { ContributionsHead } from '@/components/ContributionsHead';
import { GoverningPartyChip } from '@/components/parties/GoverningPartyChip';
import { partyComposition } from '@/lib/party/composition';

type RoleWithPerson = Role & {
    person: Person;
};

/**
 * An underline tab trigger: no box, no fill — a 2px rule in the site's deep
 * orange under the active label. Overrides the boxed default of ui/tabs.
 */
const underlineTabClass =
    '-mb-px rounded-none no-underline hover:no-underline border-b-2 border-transparent bg-transparent px-0 pb-2.5 pt-0 text-sm font-semibold text-muted-foreground shadow-none ' +
    'data-[state=active]:border-[hsl(var(--orange-deep))] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none';

// Party Members Tab Component
function PartyMembersTab({
    city,
    party,
    people,
    canEdit,
    administrativeBodies
}: {
    city: City,
    party: PartyWithPersons,
    people: PersonWithRelations[],
    canEdit: boolean,
    administrativeBodies: AdministrativeBody[]
}) {
    const t = useTranslations('Party');
    const tCommon = useTranslations('Common');
    const [isRankingSheetOpen, setIsRankingSheetOpen] = useState(false);
    const [selectedTypes, setSelectedTypes] = useState<AdministrativeBodyType[]>([]);

    // Get administrative body types that party members belong to
    const partyMembers = useMemo(() =>
        people.filter(person =>
            person.roles.some(role => role.partyId === party.id)
        ),
        [people, party.id]
    );

    const typeOptions = useMemo(() =>
        getAdministrativeBodyTypesForPeople(partyMembers, tCommon),
        [partyMembers, tCommon]
    );

    // Filter people based on selected admin body types
    const filterByAdminBodyType = useCallback((person: PersonWithRelations) => {
        return filterPersonByAdminBodyTypes(person, selectedTypes);
    }, [selectedTypes]);

    // Filter people to only include those with active party roles
    const activePeople = useMemo(() =>
        people.filter(person =>
            person.roles.some(role =>
                role.partyId === party.id &&
                isRoleActive(role)
            ) && filterByAdminBodyType(person)
        ),
        [people, party.id, filterByAdminBodyType]);

    // Filter people to only include those with inactive party roles
    const inactivePeople = useMemo(() =>
        people.filter(person =>
            person.roles.some(role =>
                role.partyId === party.id &&
                !isRoleActive(role)
            ) && filterByAdminBodyType(person)
        ),
        [people, party.id, filterByAdminBodyType]);

    return (
        <div className="space-y-8">
            {/* Current Members Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <h2 className="!m-0 !text-left">{t('currentMembers')}</h2>
                        <span className="text-sm text-muted-foreground">({activePeople.length})</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {typeOptions.length > 1 && (
                            <BadgePicker
                                options={typeOptions}
                                selectedValues={selectedTypes}
                                onSelectionChange={values => {
                                    captureEvent('profile_filter', { page: 'party', kind: 'body_scope', value_id: values[0] ?? null, active: values.length > 0, city_id: city.id });
                                    setSelectedTypes(values);
                                }}
                                allLabel={tCommon('allPeople')}
                            />
                        )}
                        {canEdit && city.peopleOrdering === 'partyRank' && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsRankingSheetOpen(true)}
                                >
                                    {t('changeMemberOrdering')}
                                </Button>
                                <PartyMemberRankingSheet
                                    open={isRankingSheetOpen}
                                    onOpenChange={setIsRankingSheetOpen}
                                    party={party}
                                    people={people}
                                    cityId={city.id}
                                />
                            </>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortPartyMembers(activePeople, party.id, true)
                        .map(person => (
                            <PersonCard
                                key={person.id}
                                item={person}
                                editable={canEdit}
                                analyticsSurface="party_members"
                            />
                        ))}
                </div>
            </motion.div>

            {/* Past Members Section - only show if there are inactive people */}
            {inactivePeople.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <h2 className="mb-4">{t('pastMembers')} ({inactivePeople.length})</h2>
                    <div className="space-y-3">
                        {sortInactivePartyMembers(inactivePeople, party.id)
                            .map(person => (
                                <motion.div
                                    key={person.id}
                                    className="p-3 sm:p-4 border rounded-lg bg-card/50"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <Link
                                            href={`/${city.id}/people/${person.id}`}
                                            className="flex items-center gap-3 hover:opacity-80 transition-opacity flex-1 min-w-0"
                                        >
                                            <div className="relative w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0">
                                                <ImageOrInitials
                                                    imageUrl={person.image}
                                                    name={person.name}
                                                    width={40}
                                                    height={40}
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-sm sm:text-base truncate">{person.name}</div>
                                                <div className="text-xs sm:text-sm text-muted-foreground">
                                                    {person.roles
                                                        .filter(role => role.partyId === party.id)
                                                        .some(role => role.isHead) && t('partyLeader')}
                                                    {person.roles
                                                        .filter(role => role.partyId === party.id && role.name)
                                                        .map(role => role.name)
                                                        .join(', ')}
                                                </div>
                                            </div>
                                        </Link>
                                        <span className="text-xs text-muted-foreground text-right flex-shrink-0">
                                            {(() => {
                                                const partyRoles = person.roles.filter(role => role.partyId === party.id);
                                                const { startDate, endDate } = getDateRangeFromRoles(partyRoles);
                                                return formatDateRange(startDate, endDate, tCommon);
                                            })()}
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                    </div>
                </motion.div>
            )}
        </div>
    );
}

// Segments Tab Component
function SegmentsTab({
    typeOptions,
    selectedType,
    onSelectType,
    contributions,
    isLoadingContributions,
    totalCount,
    setPage,
    searchQuery,
    setSearchQuery,
    handleSearch,
    allLabel
}: {
    typeOptions: { value: AdministrativeBodyType; label: string }[],
    selectedType: AdministrativeBodyType | null,
    onSelectType: (type: AdministrativeBodyType | null) => void,
    contributions: ContributionForPerson[],
    isLoadingContributions: boolean,
    totalCount: number,
    setPage: (updater: (prev: number) => number) => void,
    searchQuery: string,
    setSearchQuery: (query: string) => void,
    handleSearch: (e: React.FormEvent) => void,
    allLabel: string
}) {
    const t = useTranslations('Party');
    const tCommon = useTranslations('Common');

    const selectedValues = selectedType ? [selectedType] : [];
    const handleSelectionChange = (values: AdministrativeBodyType[]) => {
        onSelectType(values.length > 0 ? values[0] : null);
    };

    return (
        <div className="space-y-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <ContributionsHead
                    title={t('recentContributions')}
                    count={totalCount}
                    placeholder={tCommon('search')}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    onSearchSubmit={handleSearch}
                />
            </motion.div>

            {typeOptions.length > 1 && (
                <BadgePicker
                    options={typeOptions}
                    selectedValues={selectedValues}
                    onSelectionChange={handleSelectionChange}
                    allLabel={allLabel}
                />
            )}

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="relative"
            >
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
                                        withdrawn: contribution.subject.withdrawn,
                                        topic: contribution.subject.topic
                                            ? {
                                                name: contribution.subject.topic.name,
                                                colorHex: contribution.subject.topic.colorHex,
                                                icon: contribution.subject.topic.icon,
                                            }
                                            : null,
                                    }}
                                    showPlayButton={false}
                                    sourcePage="party"
                                />
                            </motion.div>
                        ))}

                        {contributions.length === 0 && !isLoadingContributions && (
                            <div className="text-center py-8 border rounded-lg bg-card/50">
                                <p className="text-muted-foreground text-sm sm:text-base">{t('noSegmentsFound')}</p>
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
                        onClick={() => {
                            captureEvent('profile_load_more', { page: 'party', loaded_count: contributions.length, total_count: totalCount });
                            setPage(prevPage => prevPage + 1);
                        }}
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
        </div>
    );
}

export default function PartyC({ city, party, administrativeBodies }: {
    city: City,
    party: PartyWithPersons,
    administrativeBodies: AdministrativeBody[],
}) {
    const t = useTranslations('Party');
    const tCommon = useTranslations('Common');
    const tOverview = useTranslations('cityOverview');
    const tCity = useTranslations('City');
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [contributions, setContributions] = useState<ContributionForPerson[]>([]);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [canEdit, setCanEdit] = useState(false);
    const [selectedAdminBodyType, setSelectedAdminBodyType] = useState<AdministrativeBodyType | null>(null);
    const [isLoadingContributions, setIsLoadingContributions] = useState(false);

    // Use people directly from the party object
    const persons = useMemo(() => party.people, [party.people]);

    // Get admin body type options from party members
    const typeOptions = useMemo(() =>
        getAdministrativeBodyTypesForPeople(persons, tCommon),
        [persons, tCommon]
    );

    // Create roles with person objects for compatibility with existing code
    const rolesWithPersons = useMemo(() => {
        return persons.flatMap(person =>
            person.roles
                .filter(role => role.partyId === party.id)
                .map(role => ({
                    ...role,
                    person: person
                }))
        ) as RoleWithPerson[];
    }, [persons, party.id]);

    const activeRoles = useMemo(() => filterActiveRoles(rolesWithPersons), [rolesWithPersons]);

    // Find the current party leader
    const partyLeader = useMemo(() => activeRoles.find((role: RoleWithPerson) => role.isHead), [activeRoles]);

    // Seats per body and the governing-party standing — the same derivation the
    // city overview's cards run, so the two surfaces can never disagree.
    const composition = useMemo(() => partyComposition(party), [party]);
    const compositionRows = useMemo(() => [
        { key: 'council', label: tCommon('adminBodyType_council'), count: composition.council },
        { key: 'committee', label: tCommon('adminBodyType_committee'), count: composition.committee },
        { key: 'community', label: tCommon('adminBodyType_community'), count: composition.community },
    ].filter(row => row.count > 0), [composition, tCommon]);
    const compositionMax = Math.max(1, ...compositionRows.map(row => row.count));

    useEffect(() => {
        const checkEditPermissions = async () => {
            const hasPermission = await isUserAuthorizedToEdit({ partyId: party.id });
            setCanEdit(hasPermission);
        };
        checkEditPermissions();
    }, [party.id]);

    useEffect(() => {
        const fetchLatestContributions = async () => {
            try {
                setIsLoadingContributions(true);
                setContributions([]);
                setPage(1);
                const { results, totalCount } = await getLatestContributionsForParty(
                    party.id,
                    1,
                    5,
                    selectedAdminBodyType
                );
                setContributions(results);
                setTotalCount(totalCount);
            } catch (error) {
                console.error('Error fetching contributions:', error);
            } finally {
                setIsLoadingContributions(false);
            }
        };
        fetchLatestContributions();
    }, [party.id, selectedAdminBodyType]);

    useEffect(() => {
        const loadMoreContributions = async () => {
            if (page === 1) return;
            try {
                setIsLoadingContributions(true);
                const { results } = await getLatestContributionsForParty(
                    party.id,
                    page,
                    5,
                    selectedAdminBodyType
                );
                setContributions(prev => [...prev, ...results]);
            } catch (error) {
                console.error('Error loading more contributions:', error);
            } finally {
                setIsLoadingContributions(false);
            }
        };
        loadMoreContributions();
    }, [party.id, page, selectedAdminBodyType]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        captureEvent('profile_search', { page: 'party', query_length: searchQuery.length, city_id: city.id });
        const params = new URLSearchParams();
        params.set('query', searchQuery);
        params.set('partyId', party.id);
        router.push(`/search?${params.toString()}`);
    };

    const onDelete = async () => {
        try {
            const response = await fetch(`/api/cities/${city.id}/parties/${party.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast({
                    title: t('partyDeleted', { name: party.name }),
                });
                router.push(`/${city.id}`);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete party');
            }
        } catch (error) {
            console.error('Error deleting party:', error);
            toast({
                title: error instanceof Error ? error.message : 'An unexpected error occurred',
                variant: 'destructive'
            });
        }
    }

    // Handler for admin body type selection
    const handleAdminBodyTypeSelect = (type: AdministrativeBodyType | null) => {
        captureEvent('profile_filter', { page: 'party', kind: 'body_scope', value_id: type, active: type !== null, city_id: city.id });
        setSelectedAdminBodyType(type);
    };

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-4 sm:py-6 lg:py-8 space-y-6 sm:space-y-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
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
                                    <Link href={`/${city.id}/parties`}>{tCity('parties')}</Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink href={`/${city.id}/parties/${party.id}`}>{party.name}</BreadcrumbLink>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>

                    {/* Identity band: the party as a colour — its logo, or a washed
                        tile of its initials in the same wash/ink derivation the topic
                        chips use — then its standing and the seat facts a reader can
                        compare across parties. Admin controls sit in the hazard-striped
                        corner every back-of-house control now uses. */}
                    <EntityHeader
                        avatar={(
                            <span className="block h-[84px] w-[84px] shrink-0">
                                <ImageOrInitials
                                    imageUrl={party.logo}
                                    name={party.name_short || party.name}
                                    color={party.colorHex}
                                    width={84}
                                    height={84}
                                    square
                                    variant="wash"
                                />
                            </span>
                        )}
                        name={party.name}
                        badges={(composition.hasMayor || partyLeader) && (
                            <>
                                {composition.hasMayor && <GoverningPartyChip colorHex={party.colorHex} />}
                                {partyLeader && (
                                    <span className="inline-flex items-center gap-1.5 text-sm">
                                        <span className="text-muted-foreground">{t('leaderLabel')}</span>
                                        <Link
                                            href={`/${city.id}/people/${partyLeader.person.id}`}
                                            className="font-medium hover:underline"
                                        >
                                            {partyLeader.person.name}
                                        </Link>
                                    </span>
                                )}
                            </>
                        )}
                        facts={(
                            <>
                                <span>
                                    <span className="font-bold tabular-nums" style={{ color: party.colorHex }}>{composition.council}</span>
                                    {' '}
                                    {tOverview('seatsInCouncil', { count: composition.council })}
                                </span>
                                {composition.committee > 0 && (
                                    <>
                                        <FactDot />
                                        <span>{tOverview('inCommittees', { count: composition.committee })}</span>
                                    </>
                                )}
                                {composition.community > 0 && (
                                    <>
                                        <FactDot />
                                        <span>{tOverview('inCommunities', { count: composition.community })}</span>
                                    </>
                                )}
                                <FactDot />
                                <span>{t('membersCount', { count: composition.members.length })}</span>
                            </>
                        )}
                        admin={canEdit && (
                            <AdminStrip className="shrink-0 self-start">
                                <FormSheet
                                    FormComponent={PartyForm}
                                    formProps={{ party, cityId: city.id }}
                                    title={t('editParty')}
                                    type="edit"
                                    triggerVariant="ghost"
                                    triggerSize="sm"
                                    triggerClassName={adminToolClass}
                                />
                                <AdminToolButton destructive onClick={onDelete}>
                                    {t('deleteParty')}
                                </AdminToolButton>
                            </AdminStrip>
                        )}
                    />

                    {/* Main and rail: the tabs carry the roster and the record, the
                        rail keeps the party's composition and its επικεφαλής in view
                        whichever tab is open. Underline triggers, not boxed ones — the
                        two views are peers, not modes. */}
                    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_316px] lg:gap-10">
                        <Tabs defaultValue="people" className="min-w-0">
                            <TabsList className="h-auto w-full justify-start gap-6 overflow-x-visible rounded-none border-b border-border bg-transparent p-0">
                                <TabsTrigger value="people" className={underlineTabClass}>
                                    {t('tabPeople')}
                                    <span className="ml-1.5 font-normal text-muted-foreground">({composition.members.length})</span>
                                </TabsTrigger>
                                <TabsTrigger value="contributions" className={underlineTabClass}>
                                    {t('tabSegments')}
                                    {totalCount > 0 && <span className="ml-1.5 font-normal text-muted-foreground">({totalCount})</span>}
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="people" className="mt-6">
                                <PartyMembersTab
                                    city={city}
                                    party={party}
                                    people={persons}
                                    canEdit={canEdit}
                                    administrativeBodies={administrativeBodies}
                                />
                            </TabsContent>

                            <TabsContent value="contributions" className="mt-6">
                                <SegmentsTab
                                    typeOptions={typeOptions}
                                    selectedType={selectedAdminBodyType}
                                    onSelectType={handleAdminBodyTypeSelect}
                                    contributions={contributions}
                                    isLoadingContributions={isLoadingContributions}
                                    totalCount={totalCount}
                                    setPage={setPage}
                                    searchQuery={searchQuery}
                                    setSearchQuery={setSearchQuery}
                                    handleSearch={handleSearch}
                                    allLabel={tCommon('allMeetings')}
                                />
                            </TabsContent>
                        </Tabs>

                        <aside className="min-w-0 space-y-4 lg:pt-[2.6rem]">
                            <RailCard title={t('compositionCard')}>
                                <ul className="space-y-3">
                                    {compositionRows.map(row => (
                                        <RailMeterRow
                                            key={row.key}
                                            label={row.label}
                                            value={row.count}
                                            ratio={row.count / compositionMax}
                                            color={party.colorHex}
                                        />
                                    ))}
                                </ul>
                                <div className="mt-3 border-t border-border pt-2.5 text-[12px] text-muted-foreground">
                                    {t('membersTotal', { count: composition.members.length })}
                                </div>
                            </RailCard>

                            {partyLeader && (
                                <RailCard title={t('partyLeader')}>
                                    <Link
                                        href={`/${city.id}/people/${partyLeader.person.id}`}
                                        onClick={() => captureEvent('person_opened', { surface: 'party_leader', city_id: city.id, person_id: partyLeader.person.id })}
                                        className="group flex items-center gap-3 hover:no-underline"
                                    >
                                        <span className="block h-11 w-11 shrink-0">
                                            <ImageOrInitials
                                                imageUrl={partyLeader.person.image}
                                                name={partyLeader.person.name}
                                                color={party.colorHex}
                                                width={44}
                                                height={44}
                                            />
                                        </span>
                                        <span className="min-w-0 text-sm font-semibold transition-colors group-hover:text-[hsl(var(--orange))]">
                                            {partyLeader.person.name}
                                        </span>
                                    </Link>
                                </RailCard>
                            )}
                        </aside>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
