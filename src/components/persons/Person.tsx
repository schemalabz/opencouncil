"use client";
import { useTranslations } from 'next-intl';
import { City, Party, Person } from '@prisma/client';
import { Button } from '../ui/button';
import FormSheet from '../FormSheet';
import PersonForm from './PersonForm';
import { deletePerson } from '@/lib/db/people';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Search } from "lucide-react";
import { Input } from '../ui/input';
import { useState, useEffect } from 'react';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Link } from '@/i18n/routing';
import { Statistics } from '../Statistics';
import { getLatestSegmentsForSpeaker } from '@/lib/search/search';
import { SearchResult } from '@/lib/search/search';
import { format } from 'date-fns';
import { PersonBadge } from './PersonBadge';
import { Result } from '@/components/search/Result';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { ExternalLink } from "lucide-react";
import { motion } from 'framer-motion';
import { ImageOrInitials } from '@/components/ImageOrInitials'

export default function PersonC({ city, person, parties }: { city: City, person: Person & { party: Party | null }, parties: Party[] }) {
    const t = useTranslations('Person');
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [latestSegments, setLatestSegments] = useState<SearchResult[]>([]);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [canEdit, setCanEdit] = useState(false);

    useEffect(() => {
        const checkEditPermissions = async () => {
            const hasPermission = await isUserAuthorizedToEdit({ personId: person.id });
            setCanEdit(hasPermission);
        };
        checkEditPermissions();
    }, [person.id]);

    useEffect(() => {
        const fetchLatestSegments = async () => {
            const { results, totalCount } = await getLatestSegmentsForSpeaker(person.id, page);
            setLatestSegments(prevSegments => [...prevSegments, ...results]);
            setTotalCount(totalCount);
        };
        fetchLatestSegments();
    }, [person.id, page]);

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
        if (to && !from) return `${t('activeUntil')} ${formatDate(to)}`;
        if (from && to) return `${t('active')}: ${formatDate(from)} - ${formatDate(to)}`;
        return null;
    };

    const formatDate = (date: Date | null) => {
        return date ? format(date, 'dd/MM/yyyy') : '-';
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
                                <BreadcrumbLink href={`/${city.id}/persons/${person.id}`}>{person.name}</BreadcrumbLink>
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
                                    imageUrl={person.image}
                                    name={person.name}
                                    width={160}
                                    height={160}
                                    className="rounded-full"
                                />
                            </div>
                            <div className="text-center md:text-left space-y-3">
                                <motion.h1
                                    className="text-4xl md:text-5xl font-normal tracking-tight"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    {person.name}
                                </motion.h1>
                                <div className="flex flex-col md:flex-row items-center md:items-start gap-3">
                                    {person.party && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.3 }}
                                            className="flex items-center gap-2"
                                        >
                                            <Link
                                                href={`/${person.cityId}/parties/${person.party.id}`}
                                                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                                            >
                                                <div className="relative w-6 h-6">
                                                    <ImageOrInitials
                                                        imageUrl={person.party.logo}
                                                        name={person.party.name_short}
                                                        color={person.party.colorHex}
                                                        width={24}
                                                        height={24}
                                                    />
                                                </div>
                                                <span className="text-lg text-muted-foreground">
                                                    {person.party.name}
                                                </span>
                                            </Link>
                                        </motion.div>
                                    )}
                                    {person.role && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.4 }}
                                            className="text-lg text-muted-foreground"
                                        >
                                            {person.role}
                                        </motion.div>
                                    )}
                                </div>
                                {person.profileUrl && (
                                    <motion.a
                                        href={person.profileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.5 }}
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        <span>Βιογραφικό</span>
                                    </motion.a>
                                )}
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
                                    FormComponent={PersonForm}
                                    formProps={{
                                        person,
                                        cityId: person.cityId,
                                        parties
                                    }}
                                    title={t('editPerson')}
                                    type="edit"
                                />
                                <Button variant="destructive" onClick={onDelete}>
                                    {t('deletePerson')}
                                </Button>
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
                            placeholder={t('searchForPerson', { personName: person.name })}
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
                            <Statistics type="person" id={person.id} cityId={city.id} />
                        </div>
                    </motion.div>

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
