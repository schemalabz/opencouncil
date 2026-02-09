"use client";
import { useTranslations } from 'next-intl';
import { City, Party, AdministrativeBody } from '@prisma/client';
import { Button } from '../ui/button';
import FormSheet from '../FormSheet';
import PersonForm from './PersonForm';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Search, ExternalLink, FileText, Clock } from "lucide-react";
import { Input } from '../ui/input';
import { useState, useEffect, useMemo } from 'react';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Link } from '@/i18n/routing';
import { Statistics } from "@/lib/statistics";
import { getLatestSegmentsForSpeaker, SegmentWithRelations } from '@/lib/db/speakerSegments';
import { Result } from '@/components/search/Result';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { motion } from 'framer-motion';
import { ImageOrInitials } from '@/components/ImageOrInitials';
import { PersonWithRelations } from '@/lib/db/people';
import { filterActiveRoles, filterInactiveRoles, formatDateRange } from '@/lib/utils';
import { AdministrativeBodyFilter } from '../AdministrativeBodyFilter';
import { RoleDisplay } from './RoleDisplay';
import { TopicFilter } from '@/components/TopicFilter';
import { RoleWithRelations } from '@/lib/db/types';
import { useSession } from 'next-auth/react';
import { DebugMetadataButton } from '../ui/debug-metadata-button';

export default function PersonC({ city, person, parties, administrativeBodies, statistics }: {
    city: City,
    person: PersonWithRelations,
    parties: Party[],
    administrativeBodies: AdministrativeBody[],
    statistics: Statistics
}) {
    const t = useTranslations('Person');
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [latestSegments, setLatestSegments] = useState<SegmentWithRelations[]>([]);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [canEdit, setCanEdit] = useState(false);
    const [selectedAdminBodyId, setSelectedAdminBodyId] = useState<string | null>(null);
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [isLoadingSegments, setIsLoadingSegments] = useState(false);
    const { data: session } = useSession();
    const isSuperAdmin = session?.user?.isSuperAdmin ?? false;

    // Filter administrative bodies to only include those related to the person
    const personRelatedAdminBodies = useMemo(() =>
        administrativeBodies.filter(adminBody =>
            person.roles.some(role => role.administrativeBodyId === adminBody.id)
        ),
        [administrativeBodies, person.roles]);

    // Filter topics to only show ones relevant to this person based on statistics
    const relevantTopics = useMemo(() => {
        if (!statistics?.topics) return [];
        return statistics.topics.map(t => t.item).sort((a, b) => a.name.localeCompare(b.name));
    }, [statistics?.topics]);

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
        const fetchLatestSegments = async () => {
            try {
                setIsLoadingSegments(true);
                setLatestSegments([]);
                const { results, totalCount } = await getLatestSegmentsForSpeaker(
                    person.id,
                    1,
                    5,
                    selectedAdminBodyId,
                    selectedTopicId
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
    }, [person.id, selectedAdminBodyId, selectedTopicId]);

    useEffect(() => {
        const loadMoreSegments = async () => {
            if (page === 1) return;
            try {
                setIsLoadingSegments(true);
                const { results } = await getLatestSegmentsForSpeaker(
                    person.id,
                    page,
                    5,
                    selectedAdminBodyId,
                    selectedTopicId
                );
                setLatestSegments(prevSegments => [...prevSegments, ...results]);
            } catch (error) {
                console.error('Error loading more segments:', error);
            } finally {
                setIsLoadingSegments(false);
            }
        };
        loadMoreSegments();
    }, [person.id, page, selectedAdminBodyId, selectedTopicId]);

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

    // Handler for administrative body selection
    const handleAdminBodySelect = (adminBodyId: string | null) => {
        setSelectedAdminBodyId(adminBodyId);
    };

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
                    <div className="flex flex-col gap-6 sm:gap-8 pb-6 sm:pb-8 border-b">
                        <div className="flex items-start justify-between gap-4">
                            <motion.div
                                className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 flex-1"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5 }}
                            >
                            <div className="relative w-24 h-24 sm:w-28 sm:h-28 lg:w-40 lg:h-40 xl:w-48 xl:h-48 flex-shrink-0 overflow-hidden rounded-full">
                                <div className="w-full h-full [&>div]:!border-0">
                                    <ImageOrInitials
                                        imageUrl={person.image}
                                        name={person.name}
                                        width={192}
                                        height={192}
                                    />
                                </div>
                            </div>
                            <div className="flex-1 space-y-3 sm:space-y-4 text-center sm:text-left min-w-0">
                                <motion.h1
                                    className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    {person.name}
                                </motion.h1>

                                {/* Active Roles - Enhanced Display */}
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.3 }}
                                    className="space-y-3"
                                >
                                    <RoleDisplay
                                        roles={filterActiveRoles(person.roles)}
                                        size="lg"
                                        layout="inline"
                                        showIcons
                                        borderless={true}
                                        className="items-start"
                                    />

                                    {/* Independent Council Member */}
                                    {isIndependentCouncilMember && (
                                        <div className="text-sm sm:text-base text-muted-foreground italic">
                                            Ανεξάρτητος Δημοτικός Σύμβουλος
                                        </div>
                                    )}
                                </motion.div>

                                {person.profileUrl && (
                                    <motion.a
                                        href={person.profileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.5 }}
                                    >
                                        <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4" />
                                        <span>Βιογραφικό</span>
                                    </motion.a>
                                )}
                            </div>
                            </motion.div>
                            {isSuperAdmin && (
                                <div className="flex-shrink-0">
                                    <DebugMetadataButton
                                        data={person}
                                        title="Person Metadata"
                                        tooltip="View person metadata"
                                    />
                                </div>
                            )}
                        </div>

                        {canEdit && (
                            <motion.div
                                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4"
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
                                <Button variant="destructive" onClick={onDelete} className="sm:w-auto">
                                    {t('deletePerson')}
                                </Button>
                            </motion.div>
                        )}
                    </div>

                    {/* Search Section */}
                    <motion.form
                        onSubmit={handleSearch}
                        className="relative"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                    >
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder={t('searchForPerson', { personName: person.name })}
                            className="pl-10 h-10 sm:h-12 text-sm sm:text-base"
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

                    {/* History Section - only show if there are inactive roles */}
                    {filterInactiveRoles(person.roles).length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.7 }}
                        >
                            <div className="flex items-center gap-2 mb-6">
                                <Clock className="h-5 w-5 text-primary" />
                                <h2 className="text-lg sm:text-xl font-semibold">{t('history')}</h2>
                            </div>

                            <div className="grid gap-4">
                                {filterInactiveRoles(person.roles).map((role) => (
                                    <motion.div
                                        key={role.id}
                                        className="p-4 border rounded-lg bg-card/50"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                    >
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <RoleDisplay
                                                    roles={[role]}
                                                    size="md"
                                                    layout="inline"
                                                    showIcons
                                                />
                                            </div>
                                            <span className="text-xs text-muted-foreground flex-shrink-0 font-medium">
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
                        <h2 className="text-lg sm:text-xl font-semibold mb-4">{t('recentSegments', { fallback: 'Πρόσφατες τοποθετήσεις' })}</h2>

                        {/* Topic Filter */}
                        {relevantTopics.length > 0 && (
                            <TopicFilter 
                                topics={relevantTopics}
                                selectedTopicId={selectedTopicId}
                                onSelectTopic={handleTopicSelect}
                            />
                        )}

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
                                    <div className="flex flex-col items-center justify-center py-12 px-4 border rounded-lg bg-card/50">
                                        <FileText className="w-8 h-8 sm:w-12 sm:h-12 text-muted-foreground mb-4" />
                                        <div className="text-muted-foreground text-center space-y-2">
                                            <p className="text-sm sm:text-base">{t('noSegmentsFound')}</p>
                                            <p className="text-xs sm:text-sm max-w-md mx-auto">{t('tryDifferentFilter', { fallback: 'Δοκιμάστε να αλλάξετε το φίλτρο ή ελέγξτε αργότερα για νέες τοποθετήσεις.' })}</p>
                                        </div>
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
                </motion.div>
            </div>
        </div>
    );
}