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
        <div className="container mx-auto py-8">
            <Breadcrumb className="mb-4">
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
            <div className="flex items-center justify-between mb-8">
                <div className="flex flex-col space-y-2">
                    <div className="flex items-center space-x-4">
                        <PersonBadge
                            person={{ ...person, party: person.party }}
                            size="xl"
                        />
                        {formatActiveDates(person.activeFrom, person.activeTo) && (
                            <p className="text-sm text-gray-600">
                                {formatActiveDates(person.activeFrom, person.activeTo)}
                            </p>
                        )}
                    </div>
                    {person.profileUrl && (
                        <a
                            href={person.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground flex items-center space-x-1 text-sm"
                        >
                            <ExternalLink className="h-3 w-3" />
                            <span>Βιογραφικό</span>
                        </a>
                    )}
                </div>
                {canEdit && (
                    <div className="flex items-center space-x-4">
                        <FormSheet
                            FormComponent={PersonForm}
                            formProps={{ person, cityId: city.id, parties }}
                            title={t('editPerson')}
                            type="edit"
                        />
                        <Button onClick={onDelete}>{t('deletePerson')}</Button>
                    </div>
                )}
            </div>
            <form onSubmit={handleSearch} className="relative mt-8 mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                    placeholder={t('searchForPerson', { personName: person.name })}
                    className="pl-10 w-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </form>

            <div className="mt-8">
                <h2 className="text-2xl font-semibold mb-4">{t('statistics')}</h2>
                <Statistics type="person" id={person.id} cityId={city.id} />
            </div>

            <div className="mt-8">
                <h2 className="text-2xl font-semibold mb-4">Πρόσφατες τοποθετήσεις</h2>
                {latestSegments.map((result, index) => (
                    <Result key={index} result={result} className="mb-4" />
                ))}
                {latestSegments.length < totalCount && (
                    <Button onClick={() => setPage(prevPage => prevPage + 1)}>Περισσότερα</Button>
                )}
            </div>
        </div>
    );
}
