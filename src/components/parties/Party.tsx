"use client";
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import FormSheet from '../FormSheet';
import PartyForm from './PartyForm';
import { City, Party, Person } from '@prisma/client';
import Image from 'next/image';
import { ImageOrInitials } from '../ImageOrInitials';
import { Button } from '../ui/button';
import { deleteParty } from '@/lib/db/parties';
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

export default function PartyC({ city, party }: { city: City, party: Party & { persons: Person[] } }) {
    const t = useTranslations('Party');
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [latestSegments, setLatestSegments] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [canEdit, setCanEdit] = useState(false);

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
                        <BreadcrumbLink href={`/${city.id}/parties/${party.id}`}>{party.name}</BreadcrumbLink>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                    <ImageOrInitials imageUrl={party.logo} width={90} height={90} name={party.name_short} color={party.colorHex} />
                    <div>
                        <h1 className="text-3xl font-bold">{party.name}</h1>
                    </div>
                </div>
                {canEdit && (<div className="flex items-center space-x-4">
                    <FormSheet FormComponent={PartyForm} formProps={{ party, cityId: city.id }} title={t('editParty')} type="edit" />
                    <Button onClick={onDelete}>{t('deleteParty')}</Button>
                </div>)}
            </div>
            <form onSubmit={handleSearch} className="relative mt-8 mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                    placeholder={t('searchInParty', { partyName: party.name })}
                    className="pl-10 w-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </form>
            <div className="mt-8">
                <h2 className="text-2xl font-semibold mb-4">{t('statistics')}</h2>
                <Statistics type="party" id={party.id} cityId={city.id} color={party.colorHex} />
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
