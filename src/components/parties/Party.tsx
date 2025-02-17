'use client';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useMemo } from 'react';
import FormSheet from '../FormSheet';
import PartyForm from './PartyForm';
import { City, Party, Person, Role } from '@prisma/client';
import Image from 'next/image';
import { ImageOrInitials } from '../ImageOrInitials';
import { Button } from '../ui/button';
import { deleteParty, PartyWithPersons } from '@/lib/db/parties';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { Search } from "lucide-react";
import { Input } from '../ui/input';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Link } from '@/i18n/routing';
import { Statistics } from '../Statistics';
import { useCouncilMeetingData } from '../meetings/CouncilMeetingDataContext';
import { getLatestSegmentsForParty } from '@/lib/search/search';
import { Result } from '../search/Result';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { motion } from 'framer-motion';
import PersonCard from '../persons/PersonCard';
import { filterActiveRoles, filterInactiveRoles, formatDate } from '@/lib/utils';

export default function PartyC({ city, party }: { city: City, party: PartyWithPersons }) {
    const t = useTranslations('Party');
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [latestSegments, setLatestSegments] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [canEdit, setCanEdit] = useState(false);

    const persons = Array.from(new Map(party.roles.map(role => [role.person.id, role.person])).values());

    // Split roles into active and inactive
    const activeRoles = useMemo(() => filterActiveRoles(party.roles), [party.roles]);
    const inactiveRoles = useMemo(() => filterInactiveRoles(party.roles), [party.roles]);

    useEffect(() => {
        const checkEditPermissions = async () => {
            const hasPermission = await isUserAuthorizedToEdit({ partyId: party.id });
            setCanEdit(hasPermission);
        };
        checkEditPermissions();
    }, [party.id]);

    useEffect(() => {
        const fetchLatestSegments = async () => {
            const { results, totalCount } = await getLatestSegmentsForParty(party.id, page);
            setLatestSegments(prevSegments => [...prevSegments, ...results]);
            setTotalCount(totalCount);
        };
        fetchLatestSegments();
    }, [party.id, page]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        params.set('query', searchQuery);
        params.set('partyId', party.id);
        router.push(`/search?${params.toString()}`);
    };

    const onDelete = async () => {
        await deleteParty(party.id).then(() => {
            toast({
                title: t('partyDeleted', { name: party.name }),
            });
            router.push(`/${city.id}`);
        });
    }

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

                    {/* Search Section */}
                    <motion.form
                        onSubmit={handleSearch}
                        className="relative mb-12 max-w-2xl mx-auto"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                    >
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            placeholder={t('searchInParty', { partyName: party.name })}
                            className="pl-12 w-full h-12 text-lg"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </motion.form>

                    {/* Statistics Section */}
                    <motion.div
                        className="mb-12"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                    >
                        <h2 className="text-2xl font-normal tracking-tight mb-6">{t('statistics')}</h2>
                        <div className="bg-card rounded-lg border shadow-sm p-6">
                            <Statistics type="party" id={party.id} cityId={city.id} color={party.colorHex} />
                        </div>
                    </motion.div>

                    {/* Current Members Section */}
                    <motion.div
                        className="mb-12"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                    >
                        <h2 className="text-2xl font-normal tracking-tight mb-6">{t('currentMembers')}</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {activeRoles
                                .sort((a, b) => {
                                    // Sort by isHead first (true comes before false)
                                    if (a.isHead && !b.isHead) return -1;
                                    if (!a.isHead && b.isHead) return 1;
                                    // Then sort by name
                                    return a.person.name.localeCompare(b.person.name);
                                })
                                .map(role => {
                                    const personWithRelations = {
                                        ...role.person,
                                        party,
                                        roles: [role]
                                    };
                                    return (
                                        <PersonCard
                                            key={role.person.id}
                                            item={personWithRelations}
                                            editable={canEdit}
                                            parties={[party]}
                                        />
                                    );
                                })}
                        </div>
                    </motion.div>

                    {/* Past Members Section - only show if there are inactive roles */}
                    {inactiveRoles.length > 0 && (
                        <motion.div
                            className="mb-12"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.8 }}
                        >
                            <h2 className="text-2xl font-normal tracking-tight mb-6">{t('pastMembers')}</h2>
                            <div className="space-y-4">
                                {inactiveRoles
                                    .sort((a, b) => {
                                        // Sort by most recent end date first
                                        const aEnd = a.endDate ? new Date(a.endDate).getTime() : 0;
                                        const bEnd = b.endDate ? new Date(b.endDate).getTime() : 0;
                                        if (aEnd !== bEnd) return bEnd - aEnd;
                                        // Then sort by name
                                        return a.person.name.localeCompare(b.person.name);
                                    })
                                    .map(role => (
                                        <motion.div
                                            key={role.id}
                                            className="p-4 border rounded-lg"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                        >
                                            <div className="flex items-center gap-4">
                                                <Link
                                                    href={`/${city.id}/people/${role.person.id}`}
                                                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                                                >
                                                    <div className="relative w-10 h-10">
                                                        <ImageOrInitials
                                                            imageUrl={role.person.image}
                                                            name={role.person.name}
                                                            width={40}
                                                            height={40}
                                                        />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium">{role.person.name}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {role.isHead && t('partyLeader')}
                                                            {role.name && !role.isHead && role.name}
                                                        </div>
                                                    </div>
                                                </Link>
                                                <span className="text-sm text-muted-foreground ml-auto">
                                                    {role.startDate && formatDate(role.startDate)}
                                                    {' - '}
                                                    {role.endDate && formatDate(role.endDate)}
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
                    >
                        <h2 className="text-2xl font-normal tracking-tight mb-6">Πρόσφατες τοποθετήσεις</h2>
                        <div className="space-y-4">
                            {latestSegments.map((result, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 * index }}
                                >
                                    <Result result={result} />
                                </motion.div>
                            ))}
                        </div>
                        {latestSegments.length < totalCount && (
                            <Button
                                onClick={() => setPage(prevPage => prevPage + 1)}
                                variant="outline"
                                className="mt-6"
                            >
                                Περισσότερα
                            </Button>
                        )}
                    </motion.div>
                </motion.div>
            </div>
        </div>
    );
}
