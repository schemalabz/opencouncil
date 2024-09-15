"use client";
import { useTranslations } from 'next-intl';
import { City, Party, Person } from '@prisma/client';
import { ImageOrInitials } from '../ImageOrInitials';
import { Button } from '../ui/button';
import FormSheet from '../FormSheet';
import PersonForm from './PersonForm';
import { deletePerson } from '@/lib/db/people';
import { redirect } from '@/i18n/routing';
import { toast } from '@/hooks/use-toast';
import PartyBadge from '../PartyBadge';
import { useRouter } from 'next/navigation';
import { Search } from "lucide-react";
import { Input } from '../ui/input';
import { useState } from 'react';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Link } from '@/i18n/routing';

export default function PersonC({ city, person, editable, parties }: { city: City, person: Person & { party: Party | null }, editable: boolean, parties: Party[] }) {
    const t = useTranslations('Person');
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");

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
                <div className="flex items-center space-x-4">
                    <ImageOrInitials imageUrl={person.image} width={90} height={90} name={person.name} />
                    <div>
                        <h1 className="text-3xl font-bold">{person.name}</h1>
                        {person.role && <p className="text-xl text-gray-600">{person.role}</p>}
                        {person.party && <PartyBadge party={person.party} shortName={false} />}
                    </div>
                </div>
                {editable && (
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
            <div className="mt-4">
                <h2 className="text-2xl font-semibold mb-2">{t('details')}</h2>
                <p><strong>{t('englishName')}:</strong> {person.name_en}</p>
                <p><strong>{t('shortName')}:</strong> {person.name_short}</p>
                <p><strong>{t('shortNameEnglish')}:</strong> {person.name_short_en}</p>
                {person.role_en && <p><strong>{t('englishRole')}:</strong> {person.role_en}</p>}
                {person.activeFrom && <p><strong>{t('activeFrom')}:</strong> {new Date(person.activeFrom).toLocaleDateString()}</p>}
                {person.activeTo && <p><strong>{t('activeTo')}:</strong> {new Date(person.activeTo).toLocaleDateString()}</p>}
            </div>
        </div>
    );
}
