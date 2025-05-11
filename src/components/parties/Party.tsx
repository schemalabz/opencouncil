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
import { Search } from "lucide-react";
import { Input } from '../ui/input';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Link } from '@/i18n/routing';
import { Statistics } from '../Statistics';
import { getLatestSegmentsForParty, SegmentWithRelations } from '@/lib/db/speakerSegments';
import { Result } from '../search/Result';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { motion } from 'framer-motion';
import PersonCard from '../persons/PersonCard';
import { filterActiveRoles, filterInactiveRoles, formatDateRange } from '@/lib/utils';
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
                (!role.endDate || new Date(role.endDate) > new Date())
            )
        ),
        [people, party.id]);

    // Filter people to only include those with inactive party roles
    const inactivePeople = useMemo(() =>
        people.filter(person =>
            person.roles.some(role =>
                role.partyId === party.id &&
                role.endDate &&
                new Date(role.endDate) <= new Date()
            )
        ),
        [people, party.id]);

    return (
        <div className="space-y-12">
            {/* Current Members Section */}
            <motion.div
                className="mb-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <h2 className="text-2xl font-normal tracking-tight mb-6">{t('currentMembers')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                    className="mb-12"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <h2 className="text-2xl font-normal tracking-tight mb-6">{t('pastMembers')}</h2>
                    <div className="space-y-4">
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
                                    className="p-4 border rounded-lg"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    <div className="flex items-center gap-4">
                                        <Link
                                            href={`/${city.id}/people/${person.id}`}
                                            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                                        >
                                            <div className="relative w-10 h-10">
                                                <ImageOrInitials
                                                    imageUrl={person.image}
                                                    name={person.name}
                                                    width={40}
                                                    height={40}
                                                />
                                            </div>
                                            <div>
                                                <div className="font-medium">{person.name}</div>
                                                <div className="text-sm text-muted-foreground">
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
                                        <span className="text-sm text-muted-foreground ml-auto">
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
        <div className="space-y-12">
            {/* Search Section */}
            <motion.form
                onSubmit={handleSearch}
                className="relative mb-12 max-w-2xl mx-auto"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    placeholder={t('searchInParty', { partyName: party.name })}
                    className="pl-12 w-full h-12 text-lg"
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
                className="mb-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <h2 className="text-2xl font-normal tracking-tight mb-6">{t('statistics')}</h2>
                <div className="bg-card rounded-lg border shadow-sm p-6 min-h-[300px] relative">
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
                <h2 className="text-2xl font-normal tracking-tight mb-6">Πρόσφατες τοποθετήσεις</h2>

                {isLoadingSegments && latestSegments.length === 0 ? (
                    <div className="flex justify-center items-center py-12">
                        <div className="flex flex-col items-center space-y-4">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                            <p className="text-sm text-muted-foreground">{t('loadingSegments')}</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
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
                            <div className="text-center py-8">
                                <p className="text-muted-foreground">{t('noSegmentsFound')}</p>
                            </div>
                        )}
                    </div>
                )}

                {isLoadingSegments && latestSegments.length > 0 && (
                    <div className="flex justify-center items-center py-4">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                    </div>
                )}

                {!isLoadingSegments && latestSegments.length < totalCount && (
                    <Button
                        onClick={() => setPage(prevPage => prevPage + 1)}
                        variant="outline"
                        className="mt-6"
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
        <div className="relative min-h-screen">
            <div className="relative md:container md:mx-auto py-8 px-4 md:px-8 space-y-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <Breadcrumb className="mb-8">
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
                    <div className="flex flex-col md:flex-row items-start justify-between mb-12 gap-6">
                        <motion.div
                            className="flex flex-col md:flex-row items-center gap-6 md:space-x-8"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5 }}
                        >
                            <div className="relative w-32 h-32 md:w-40 md:h-40">
                                <ImageOrInitials
                                    imageUrl={party.logo}
                                    name={party.name_short}
                                    color={party.colorHex}
                                    width={160}
                                    height={160}
                                />
                            </div>
                            <div className="text-center md:text-left space-y-3">
                                <motion.h1
                                    className="text-4xl md:text-5xl font-normal tracking-tight"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    {party.name}
                                </motion.h1>
                                {partyLeader && (
                                    <motion.div
                                        className="text-lg"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.25 }}
                                    >
                                        <Link
                                            href={`/${city.id}/people/${partyLeader.person.id}`}
                                            className="hover:underline text-muted-foreground"
                                        >
                                            {partyLeader.person.name}
                                        </Link>
                                    </motion.div>
                                )}
                                <motion.div
                                    className="text-lg text-muted-foreground"
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
                                className="flex items-center gap-3"
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
                                <Button variant="destructive" onClick={onDelete}>{t('deleteParty')}</Button>
                            </motion.div>
                        )}
                    </div>

                    {/* Tabs */}
                    <Tabs defaultValue="people" className="space-y-6 md:space-y-8">
                        <div className="flex justify-center">
                            <TabsList className="gap-2 sm:gap-8 p-1 bg-background/80 backdrop-blur-sm w-full flex justify-center">
                                <TabsTrigger value="people" className="px-3 sm:px-6 py-2 text-sm sm:text-base whitespace-nowrap">
                                    Πρόσωπα
                                </TabsTrigger>
                                <TabsTrigger value="statistics" className="px-3 sm:px-6 py-2 text-sm sm:text-base whitespace-nowrap">
                                    Στατιστικά και τοποθετήσεις
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
