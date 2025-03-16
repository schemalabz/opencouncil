"use client";
import { useTranslations } from 'next-intl';
import { City, Party, Person, Role, AdministrativeBody } from '@prisma/client';
import { Button } from '../ui/button';
import FormSheet from '../FormSheet';
import PersonForm from './PersonForm';
import { deletePerson } from '@/lib/db/people';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Search, ExternalLink, FileText } from "lucide-react";
import { Input } from '../ui/input';
import { useState, useEffect, useMemo } from 'react';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Link } from '@/i18n/routing';
import { Statistics as StatisticsType } from "@/lib/statistics";
import { Statistics } from '../Statistics';
import { getLatestSegmentsForSpeaker } from '@/lib/search/search';
import { SearchResult } from '@/lib/search/search';
import { format } from 'date-fns';
import { PersonBadge } from './PersonBadge';
import { Result } from '@/components/search/Result';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { motion } from 'framer-motion';
import { ImageOrInitials } from '@/components/ImageOrInitials';
import { PersonWithRelations } from '@/lib/db/people';
import { filterActiveRoles, filterInactiveRoles, formatDateRange } from '@/lib/utils';
import { StatisticsOfPerson } from "@/lib/statistics";
import { AdministrativeBodyFilter } from '../AdministrativeBodyFilter';

type RoleWithRelations = Role & {
    party?: Party | null;
    city?: City | null;
    administrativeBody?: AdministrativeBody | null;
};

export default function PersonC({ city, person, parties, administrativeBodies, statistics }: {
    city: City,
    person: PersonWithRelations,
    parties: Party[],
    administrativeBodies: AdministrativeBody[],
    statistics: StatisticsType
}) {
    const t = useTranslations('Person');
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [latestSegments, setLatestSegments] = useState<SearchResult[]>([]);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [canEdit, setCanEdit] = useState(false);
    const [selectedAdminBodyId, setSelectedAdminBodyId] = useState<string | null>(null);
    const [isLoadingSegments, setIsLoadingSegments] = useState(false);

    // Filter administrative bodies to only include those related to the person
    const personRelatedAdminBodies = useMemo(() =>
        administrativeBodies.filter(adminBody =>
            person.roles.some(role => role.administrativeBodyId === adminBody.id)
        ),
        [administrativeBodies, person.roles]);

    // Group roles by type and active status
    const roles = useMemo(() => {
        const allRoles = person.roles as RoleWithRelations[];
        const activeRoles = filterActiveRoles(allRoles);
        const inactiveRoles = filterInactiveRoles(allRoles);

        return {
            active: {
                cityRoles: activeRoles.filter(role => role.cityId),
                partyRoles: activeRoles.filter(role => role.partyId),
                adminBodyRoles: activeRoles.filter(role => role.administrativeBodyId)
            },
            inactive: {
                cityRoles: inactiveRoles.filter(role => role.cityId),
                partyRoles: inactiveRoles.filter(role => role.partyId),
                adminBodyRoles: inactiveRoles.filter(role => role.administrativeBodyId)
            }
        };
    }, [person.roles]);

    useEffect(() => {
        const checkEditPermissions = async () => {
            const hasPermission = await isUserAuthorizedToEdit({ personId: person.id });
            setCanEdit(hasPermission);
        };
        checkEditPermissions();
    }, [person.id]);

    useEffect(() => {
        const fetchLatestSegments = async () => {
            try {
                setIsLoadingSegments(true);
                setLatestSegments([]);
                const { results, totalCount } = await getLatestSegmentsForSpeaker(
                    person.id,
                    1,
                    5,
                    selectedAdminBodyId
                );
                setLatestSegments(results);
                setTotalCount(totalCount);
                setPage(1);
            } catch (error) {
                console.error('Error fetching segments:', error);
            } finally {
                setIsLoadingSegments(false);
            }
        };
        fetchLatestSegments();
    }, [person.id, selectedAdminBodyId]);

    useEffect(() => {
        const loadMoreSegments = async () => {
            if (page === 1) return;
            try {
                setIsLoadingSegments(true);
                const { results } = await getLatestSegmentsForSpeaker(
                    person.id,
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
    }, [person.id, page, selectedAdminBodyId]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        params.set('query', searchQuery);
        params.set('personId', person.id);
        router.push(`/search?${params.toString()}`);
    };

    const onDelete = async () => {
        await deletePerson(person.id).then(() => {
            toast({
                title: t('personDeleted', { name: person.name }),
            });
            router.push(`/${city.id}`);
        });
    }

    const formatActiveDates = (from: Date | null, to: Date | null) => {
        if (!to && !from) return null;
        if (to && !from) return `${t('activeUntil')} ${formatDateRange(null, to, t)}`;
        if (from && to) return `${t('active')}: ${formatDateRange(from, to, t)}`;
        return null;
    };

    // Handler for administrative body selection
    const handleAdminBodySelect = (adminBodyId: string | null) => {
        setSelectedAdminBodyId(adminBodyId);
    };

    return (
        <div className="relative min-h-screen bg-background">
            <div className="relative max-w-7xl mx-auto py-6 sm:py-12 px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-12">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-6 sm:space-y-12"
                >
                    <Breadcrumb className="mb-4 sm:mb-8">
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
                                <BreadcrumbLink href={`/${city.id}/persons/${person.id}`}>{person.name}</BreadcrumbLink>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>

                    {/* Hero Section */}
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-6 sm:gap-8 pb-6 sm:pb-8 border-b">
                        <motion.div
                            className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8 w-full"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5 }}
                        >
                            <div className="relative w-32 h-32 sm:w-40 sm:h-40 shrink-0">
                                <ImageOrInitials
                                    imageUrl={person.image}
                                    name={person.name}
                                    width={160}
                                    height={160}
                                />
                            </div>
                            <div className="text-center sm:text-left space-y-4 flex-grow">
                                <motion.h1
                                    className="text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    {person.name}
                                </motion.h1>
                                <div className="flex flex-col gap-4">
                                    {/* Active Party Roles */}
                                    {roles.active.partyRoles.map((role) => (
                                        <motion.div
                                            key={role.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.3 }}
                                            className="flex items-center gap-2"
                                        >
                                            {role.party && (
                                                <Link
                                                    href={`/${city.id}/parties/${role.party.id}`}
                                                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                                                >
                                                    <div className="relative w-5 h-5 sm:w-6 sm:h-6">
                                                        <ImageOrInitials
                                                            imageUrl={role.party.logo}
                                                            name={role.party.name_short}
                                                            color={role.party.colorHex}
                                                            width={24}
                                                            height={24}
                                                        />
                                                    </div>
                                                    <span className="text-base sm:text-lg text-muted-foreground">
                                                        {role.party.name}
                                                        {role.name && ` - ${role.name}`}
                                                    </span>
                                                </Link>
                                            )}
                                        </motion.div>
                                    ))}

                                    {/* Active City Roles */}
                                    {roles.active.cityRoles.map((role) => (
                                        <motion.div
                                            key={role.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.4 }}
                                            className="text-base sm:text-lg text-muted-foreground"
                                        >
                                            {role.isHead ? t('mayor') : role.name}
                                        </motion.div>
                                    ))}

                                    {/* Active Administrative Body Roles */}
                                    {roles.active.adminBodyRoles.map((role) => (
                                        <motion.div
                                            key={role.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.4 }}
                                            className="text-base sm:text-lg text-muted-foreground"
                                        >
                                            {role.administrativeBody?.name}
                                            {role.name && ` - ${role.name}`}
                                        </motion.div>
                                    ))}
                                </div>
                                {person.profileUrl && (
                                    <motion.a
                                        href={person.profileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm sm:text-base"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.5 }}
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        <span>Βιογραφικό</span>
                                    </motion.a>
                                )}
                            </div>
                            {canEdit && (
                                <motion.div
                                    className="flex items-center gap-3 sm:ml-auto"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.5 }}
                                >
                                    <FormSheet
                                        FormComponent={PersonForm}
                                        formProps={{
                                            person,
                                            cityId: person.cityId,
                                            parties,
                                            administrativeBodies
                                        }}
                                        title={t('editPerson')}
                                        type="edit"
                                    />
                                    <Button variant="destructive" onClick={onDelete}>
                                        {t('deletePerson')}
                                    </Button>
                                </motion.div>
                            )}
                        </motion.div>
                    </div>

                    {/* Search Section */}
                    <motion.form
                        onSubmit={handleSearch}
                        className="relative max-w-2xl mx-auto"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                    >
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            placeholder={t('searchForPerson', { personName: person.name })}
                            className="pl-12 w-full h-12 text-base sm:text-lg"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </motion.form>

                    {/* Administrative Body Filter - only show if there's more than one related to the person */}
                    {personRelatedAdminBodies.length > 1 && (
                        <AdministrativeBodyFilter
                            administrativeBodies={administrativeBodies}
                            selectedAdminBodyId={selectedAdminBodyId}
                            onSelectAdminBody={handleAdminBodySelect}
                            personRelatedOnly={true}
                            person={person}
                        />
                    )}

                    {/* Statistics Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                        className="mb-12 rounded-xl overflow-hidden"
                    >
                        <h2 className="text-xl sm:text-2xl font-normal tracking-tight mb-4 sm:mb-6">{t('statistics')}</h2>
                        <div className="bg-card rounded-xl border shadow-sm p-4 sm:p-6 min-h-[300px] relative">
                            <Statistics
                                type="person"
                                id={person.id}
                                cityId={city.id}
                                administrativeBodyId={selectedAdminBodyId}
                                emptyStateMessage={t('noStatisticsAvailable')}
                            />
                        </div>
                    </motion.div>

                    {/* History Section - only show if there are inactive roles */}
                    {(roles.inactive.cityRoles.length > 0 ||
                        roles.inactive.partyRoles.length > 0 ||
                        roles.inactive.adminBodyRoles.length > 0) && (
                            <motion.div
                                className="mb-12"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.7 }}
                            >
                                <h2 className="text-2xl font-normal tracking-tight mb-6">{t('history')}</h2>
                                <div className="space-y-4">
                                    {/* Past Party Roles */}
                                    {roles.inactive.partyRoles.map((role) => (
                                        <motion.div
                                            key={role.id}
                                            className="p-4 border rounded-lg"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                        >
                                            {role.party && (
                                                <div className="flex items-center gap-2">
                                                    <Link
                                                        href={`/${city.id}/parties/${role.party.id}`}
                                                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                                                    >
                                                        <div className="relative w-5 h-5">
                                                            <ImageOrInitials
                                                                imageUrl={role.party.logo}
                                                                name={role.party.name_short}
                                                                color={role.party.colorHex}
                                                                width={20}
                                                                height={20}
                                                            />
                                                        </div>
                                                        <span className="text-muted-foreground">
                                                            {role.party.name}
                                                            {role.isHead && ` (${t('partyLeader')})`}
                                                            {role.name && ` - ${role.name}`}
                                                        </span>
                                                    </Link>
                                                    <span className="text-sm text-muted-foreground ml-auto">
                                                        {formatDateRange(
                                                            role.startDate ? new Date(role.startDate) : null,
                                                            role.endDate ? new Date(role.endDate) : null,
                                                            t
                                                        )}
                                                    </span>
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}

                                    {/* Past City Roles */}
                                    {roles.inactive.cityRoles.map((role) => (
                                        <motion.div
                                            key={role.id}
                                            className="p-4 border rounded-lg"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">
                                                    {role.isHead ? t('mayor') : role.name}
                                                </span>
                                                <span className="text-sm text-muted-foreground">
                                                    {formatDateRange(
                                                        role.startDate ? new Date(role.startDate) : null,
                                                        role.endDate ? new Date(role.endDate) : null,
                                                        t
                                                    )}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}

                                    {/* Past Administrative Body Roles */}
                                    {roles.inactive.adminBodyRoles.map((role) => (
                                        <motion.div
                                            key={role.id}
                                            className="p-4 border rounded-lg"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">
                                                    {role.administrativeBody?.name}
                                                    {role.isHead && ` (${t('president')})`}
                                                    {role.name && ` - ${role.name}`}
                                                </span>
                                                <span className="text-sm text-muted-foreground">
                                                    {formatDateRange(
                                                        role.startDate ? new Date(role.startDate) : null,
                                                        role.endDate ? new Date(role.endDate) : null,
                                                        t
                                                    )}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                    {/* Recent Segments Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 }}
                        className="relative"
                    >
                        <h2 className="text-xl sm:text-2xl font-normal tracking-tight mb-4 sm:mb-6">{t('recentSegments', { fallback: 'Πρόσφατες τοποθετήσεις' })}</h2>

                        {isLoadingSegments && latestSegments.length === 0 ? (
                            <div className="flex justify-center items-center py-12 border rounded-xl bg-card/50">
                                <div className="flex flex-col items-center space-y-4">
                                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                                    <p className="text-sm text-muted-foreground">{t('loadingSegments')}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 sm:space-y-4">
                                {latestSegments.map((result, index) => (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 * index }}
                                    >
                                        <Result result={result} />
                                    </motion.div>
                                ))}

                                {latestSegments.length === 0 && !isLoadingSegments && (
                                    <div className="flex flex-col items-center justify-center py-12 px-4 border rounded-xl bg-card/50">
                                        <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                                        <div className="text-muted-foreground text-center space-y-2">
                                            <p className="text-lg">{t('noSegmentsFound')}</p>
                                            <p className="text-sm max-w-md mx-auto">{t('tryDifferentFilter', { fallback: 'Δοκιμάστε να αλλάξετε το φίλτρο ή ελέγξτε αργότερα για νέες τοποθετήσεις.' })}</p>
                                        </div>
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
                </motion.div>
            </div>
        </div>
    );
}
