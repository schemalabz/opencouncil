'use client';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useMemo } from 'react';
import FormSheet from '../FormSheet';
import PartyForm from './PartyForm';
import { City, Party, Person, Role, AdministrativeBody } from '@prisma/client';
import Image from 'next/image';
import { ImageOrInitials } from '../ImageOrInitials';
import { Button } from '../ui/button';
import { PartyWithPersons } from '@/lib/db/parties';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { Search, Users, TrendingUp } from "lucide-react";
import { Input } from '../ui/input';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Link } from '@/i18n/routing';
import { Statistics } from '../Statistics';
import { getLatestSegmentsForParty, SegmentWithRelations } from '@/lib/db/speakerSegments';
import { Result } from '../search/Result';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { motion } from 'framer-motion';
import PersonCard from '../persons/PersonCard';
import { filterActiveRoles, filterInactiveRoles, formatDateRange, isRoleActive } from '@/lib/utils';
import { AdministrativeBodyFilter } from '../AdministrativeBodyFilter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonWithRelations } from '@/lib/db/people';

type RoleWithPerson = Role & {
    person: Person;
};

// Party Members Tab Component
function PartyMembersTab({
    city,
    party,
    people,
    canEdit
}: {
    city: City,
    party: PartyWithPersons,
    people: PersonWithRelations[],
    canEdit: boolean
}) {
    const t = useTranslations('Party');

    // Filter people to only include those with active party roles
    const activePeople = useMemo(() =>
        people.filter(person =>
            person.roles.some(role =>
                role.partyId === party.id &&
                isRoleActive(role)
            )
        ),
        [people, party.id]);

    // Filter people to only include those with inactive party roles
    const inactivePeople = useMemo(() =>
        people.filter(person =>
            person.roles.some(role =>
                role.partyId === party.id &&
                !isRoleActive(role)
            )
        ),
        [people, party.id]);

    return (
        <div className="space-y-8">
            {/* Current Members Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <div className="flex items-center gap-2 mb-4">
                    <Users className="h-5 w-5 text-primary" />
                    <h2 className="text-lg sm:text-xl font-semibold">{t('currentMembers')}</h2>
                    <span className="text-sm text-muted-foreground">({activePeople.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activePeople
                        .sort((a, b) => {
                            // Sort by isHead first (true comes before false)
                            const aIsHead = a.roles.some((role: Role) => role.partyId === party.id && role.isHead);
                            const bIsHead = b.roles.some((role: Role) => role.partyId === party.id && role.isHead);
                            if (aIsHead && !bIsHead) return -1;
                            if (!aIsHead && bIsHead) return 1;
                            // Then sort by name
                            return a.name.localeCompare(b.name);
                        })
                        .map(person => (
                            <PersonCard
                                key={person.id}
                                item={person}
                                editable={canEdit}
                                parties={[party]}
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
                    <h2 className="text-lg sm:text-xl font-semibold mb-4">{t('pastMembers')} ({inactivePeople.length})</h2>
                    <div className="space-y-3">
                        {inactivePeople
                            .sort((a, b) => {
                                // Sort by most recent end date first
                                const aEnd = Math.max(...a.roles
                                    .filter(role => role.partyId === party.id && role.endDate)
                                    .map(role => role.endDate ? new Date(role.endDate).getTime() : 0));
                                const bEnd = Math.max(...b.roles
                                    .filter(role => role.partyId === party.id && role.endDate)
                                    .map(role => role.endDate ? new Date(role.endDate).getTime() : 0));
                                if (aEnd !== bEnd) return bEnd - aEnd;
                                // Then sort by name
                                return a.name.localeCompare(b.name);
                            })
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
                                            {formatDateRange(
                                                new Date(Math.min(...person.roles
                                                    .filter(role => role.partyId === party.id && role.startDate)
                                                    .map(role => role.startDate ? new Date(role.startDate).getTime() : Infinity))),
                                                new Date(Math.max(...person.roles
                                                    .filter(role => role.partyId === party.id && role.endDate)
                                                    .map(role => role.endDate ? new Date(role.endDate).getTime() : 0))),
                                                t
                                            )}
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

// Statistics and Segments Tab Component
function StatisticsAndSegmentsTab({
    city,
    party,
    administrativeBodies,
    selectedAdminBodyId,
    onSelectAdminBody,
    latestSegments,
    isLoadingSegments,
    totalCount,
    setPage,
    searchQuery,
    setSearchQuery,
    handleSearch
}: {
    city: City,
    party: PartyWithPersons,
    administrativeBodies: AdministrativeBody[],
    selectedAdminBodyId: string | null,
    onSelectAdminBody: (adminBodyId: string | null) => void,
    latestSegments: SegmentWithRelations[],
    isLoadingSegments: boolean,
    totalCount: number,
    setPage: (updater: (prev: number) => number) => void,
    searchQuery: string,
    setSearchQuery: (query: string) => void,
    handleSearch: (e: React.FormEvent) => void
}) {
    const t = useTranslations('Party');

    return (
        <div className="space-y-8">
            {/* Search Section */}
            <motion.form
                onSubmit={handleSearch}
                className="relative"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder={t('searchInParty', { partyName: party.name })}
                    className="pl-10 h-10 sm:h-12 text-sm sm:text-base"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </motion.form>

            {/* Administrative Body Filter - only show if there's more than one */}
            {administrativeBodies.length > 1 && (
                <AdministrativeBodyFilter
                    administrativeBodies={administrativeBodies}
                    selectedAdminBodyId={selectedAdminBodyId}
                    onSelectAdminBody={onSelectAdminBody}
                />
            )}

            {/* Statistics Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <h2 className="text-lg sm:text-xl font-semibold">{t('statistics')}</h2>
                </div>
                <div className="bg-card rounded-lg border shadow-sm p-4 sm:p-6 min-h-[300px] relative">
                    <Statistics
                        type="party"
                        id={party.id}
                        cityId={city.id}
                        color={party.colorHex}
                        administrativeBodyId={selectedAdminBodyId}
                    />
                </div>
            </motion.div>

            {/* Recent Segments Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="relative"
            >
                <h2 className="text-lg sm:text-xl font-semibold mb-4">Πρόσφατες τοποθετήσεις</h2>

                {isLoadingSegments && latestSegments.length === 0 ? (
                    <div className="flex justify-center items-center py-12 border rounded-lg bg-card/50">
                        <div className="flex flex-col items-center space-y-4">
                            <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                            <p className="text-xs sm:text-sm text-muted-foreground">{t('loadingSegments')}</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3 sm:space-y-4">
                        {latestSegments.map((segment, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 * index }}
                            >
                                <Result result={segment} />
                            </motion.div>
                        ))}

                        {latestSegments.length === 0 && !isLoadingSegments && (
                            <div className="text-center py-8 border rounded-lg bg-card/50">
                                <p className="text-muted-foreground text-sm sm:text-base">{t('noSegmentsFound')}</p>
                            </div>
                        )}
                    </div>
                )}

                {isLoadingSegments && latestSegments.length > 0 && (
                    <div className="flex justify-center items-center py-4">
                        <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                    </div>
                )}

                {!isLoadingSegments && latestSegments.length < totalCount && (
                    <Button
                        onClick={() => setPage(prevPage => prevPage + 1)}
                        variant="outline"
                        className="mt-6 w-full sm:w-auto"
                        disabled={isLoadingSegments}
                    >
                        {isLoadingSegments ? (
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
    administrativeBodies: AdministrativeBody[]
}) {
    const t = useTranslations('Party');
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [latestSegments, setLatestSegments] = useState<SegmentWithRelations[]>([]);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [canEdit, setCanEdit] = useState(false);
    const [selectedAdminBodyId, setSelectedAdminBodyId] = useState<string | null>(null);
    const [isLoadingSegments, setIsLoadingSegments] = useState(false);

    // Use people directly from the party object
    const persons = useMemo(() => party.people, [party.people]);

    // Filter administrative bodies to only include those related to the party's people
    const partyRelatedAdminBodies = useMemo(() =>
        administrativeBodies.filter(adminBody =>
            persons.some(person =>
                person.roles.some(role => role.administrativeBodyId === adminBody.id)
            )
        ),
        [administrativeBodies, persons]);

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

    // Split roles into active and inactive
    const activeRoles = useMemo(() => filterActiveRoles(rolesWithPersons), [rolesWithPersons]);
    const inactiveRoles = useMemo(() => filterInactiveRoles(rolesWithPersons), [rolesWithPersons]);

    // Find the current party leader
    const partyLeader = useMemo(() => activeRoles.find((role: RoleWithPerson) => role.isHead), [activeRoles]);

    useEffect(() => {
        const checkEditPermissions = async () => {
            const hasPermission = await isUserAuthorizedToEdit({ partyId: party.id });
            setCanEdit(hasPermission);
        };
        checkEditPermissions();
    }, [party.id]);

    useEffect(() => {
        const fetchLatestSegments = async () => {
            try {
                setIsLoadingSegments(true);
                setLatestSegments([]);
                setPage(1);
                const { results, totalCount } = await getLatestSegmentsForParty(
                    party.id,
                    1,
                    5,
                    selectedAdminBodyId
                );
                setLatestSegments(results);
                setTotalCount(totalCount);
            } catch (error) {
                console.error('Error fetching segments:', error);
            } finally {
                setIsLoadingSegments(false);
            }
        };
        fetchLatestSegments();
    }, [party.id, selectedAdminBodyId]);

    useEffect(() => {
        const loadMoreSegments = async () => {
            if (page === 1) return;
            try {
                setIsLoadingSegments(true);
                const { results } = await getLatestSegmentsForParty(
                    party.id,
                    page,
                    5,
                    selectedAdminBodyId
                );
                setLatestSegments(prevSegments => [...prevSegments, ...results]);
            } catch (error) {
                console.error('Error loading more segments:', error);
            } finally {
                setIsLoadingSegments(false);
            }
        };
        loadMoreSegments();
    }, [party.id, page, selectedAdminBodyId]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
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

    // Handler for administrative body selection
    const handleAdminBodySelect = (adminBodyId: string | null) => {
        setSelectedAdminBodyId(adminBodyId);
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
                                    <Link href="/">Αρχική</Link>
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
                                <BreadcrumbLink href={`/${city.id}/parties/${party.id}`}>{party.name}</BreadcrumbLink>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>

                    {/* Hero Section */}
                    <div className="flex flex-col gap-6 sm:gap-8 pb-6 sm:pb-8 border-b">
                        <motion.div
                            className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5 }}
                        >
                            <div className="flex-shrink-0">
                                <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto">
                                    <ImageOrInitials
                                        imageUrl={party.logo}
                                        name={party.name_short}
                                        color={party.colorHex}
                                        width={96}
                                        height={96}
                                        square={true}
                                    />
                                </div>
                            </div>
                            <div className="flex-1 min-w-0 space-y-3 text-center sm:text-left">
                                <motion.h1
                                    className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight break-words"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    {party.name}
                                </motion.h1>
                                {partyLeader && (
                                    <motion.div
                                        className="text-sm sm:text-base"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.25 }}
                                    >
                                        <span className="text-muted-foreground">Επικεφαλής: </span>
                                        <Link
                                            href={`/${city.id}/people/${partyLeader.person.id}`}
                                            className="hover:underline text-primary font-medium"
                                        >
                                            {partyLeader.person.name}
                                        </Link>
                                    </motion.div>
                                )}
                                <motion.div
                                    className="text-sm sm:text-base text-muted-foreground"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.3 }}
                                >
                                    {t('membersCount', { count: persons.length })}
                                </motion.div>
                            </div>
                        </motion.div>

                        {canEdit && (
                            <motion.div
                                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.5 }}
                            >
                                <FormSheet
                                    FormComponent={PartyForm}
                                    formProps={{ party, cityId: city.id }}
                                    title={t('editParty')}
                                    type="edit"
                                />
                                <Button variant="destructive" onClick={onDelete} className="sm:w-auto">
                                    {t('deleteParty')}
                                </Button>
                            </motion.div>
                        )}
                    </div>

                    {/* Tabs */}
                    <Tabs defaultValue="people" className="space-y-6">
                        <div className="flex justify-center">
                            <TabsList className="grid w-full max-w-md grid-cols-2 h-auto p-1 bg-muted/50">
                                <TabsTrigger value="people" className="text-xs sm:text-sm py-2 px-3">
                                    <Users className="h-4 w-4 mr-1 sm:mr-2" />
                                    <span className="hidden xs:inline">Πρόσωπα</span>
                                    <span className="xs:hidden">Μέλη</span>
                                </TabsTrigger>
                                <TabsTrigger value="statistics" className="text-xs sm:text-sm py-2 px-3">
                                    <TrendingUp className="h-4 w-4 mr-1 sm:mr-2" />
                                    <span className="hidden sm:inline">Στατιστικά</span>
                                    <span className="sm:hidden">Stats</span>
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="people" className="mt-6">
                            <PartyMembersTab
                                city={city}
                                party={party}
                                people={persons}
                                canEdit={canEdit}
                            />
                        </TabsContent>

                        <TabsContent value="statistics" className="mt-6">
                            <StatisticsAndSegmentsTab
                                city={city}
                                party={party}
                                administrativeBodies={partyRelatedAdminBodies}
                                selectedAdminBodyId={selectedAdminBodyId}
                                onSelectAdminBody={handleAdminBodySelect}
                                latestSegments={latestSegments}
                                isLoadingSegments={isLoadingSegments}
                                totalCount={totalCount}
                                setPage={setPage}
                                searchQuery={searchQuery}
                                setSearchQuery={setSearchQuery}
                                handleSearch={handleSearch}
                            />
                        </TabsContent>
                    </Tabs>
                </motion.div>
            </div>
        </div>
    );
}
