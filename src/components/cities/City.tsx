"use client";
import { City, CouncilMeeting, Party, Person, Subject, Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Suspense, useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import AddMeetingForm from "@/components/meetings/AddMeetingForm";
import { Link } from '@/i18n/routing';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import FormSheet from '@/components/FormSheet';
import CityForm from './CityForm';
import List from '@/components/List';
import PartyCard from '@/components/parties/PartyCard';
import PartyForm from '@/components/parties/PartyForm';
import MeetingCard from '@/components/meetings/MeetingCard';
import PersonCard from '@/components/persons/PersonCard';
import PersonForm from '@/components/persons/PersonForm';
import { BadgeCheck, BadgeX, Building2, Loader2 } from 'lucide-react';
import { Search } from "lucide-react";
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { SubjectWithRelations } from '@/lib/db/subject';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { Badge } from '@/components/ui/badge'

export default function CityC({ city }: {
    city: City & {
        councilMeetings: (CouncilMeeting & { subjects: SubjectWithRelations[] })[],
        parties: (Party & { persons: Person[] })[],
        persons: (Person & { party: Party | null })[]
    }
}) {
    const t = useTranslations('City');
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const router = useRouter();
    const [canEdit, setCanEdit] = useState(false);

    useEffect(() => {
        const checkEditPermissions = async () => {
            const hasPermission = await isUserAuthorizedToEdit({ cityId: city.id });
            setCanEdit(hasPermission);
        };
        checkEditPermissions();
    }, [city.id]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        params.set('query', searchQuery);
        params.set('cityId', city.id);
        router.push(`/search?${params.toString()}`);
    };

    const orderedMeetings = [...city.councilMeetings]
        .filter(meeting => canEdit || meeting.released)
        .sort((a, b) => {
            const timeCompare = new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime();
            if (timeCompare === 0) {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            return timeCompare;
        });

    const orderedPersons = [...city.persons]
        .sort((a, b) => {
            const aLastWord = a.name.split(' ').pop() || '';
            const bLastWord = b.name.split(' ').pop() || '';
            return aLastWord.localeCompare(bLastWord);
        })

    const orderedParties = [...city.parties]
        .sort((a, b) => b.persons.length - a.persons.length);

    return (
        <div className="md:container md:mx-auto py-8">
            <Breadcrumb className="mb-4">
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                            <Link href="/">Αρχική</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink href={`/${city.id}`}>{city.name}</BreadcrumbLink>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>
            <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
                <div className="flex flex-col md:flex-row items-center gap-4 md:space-x-6">
                    {city.logoImage ? (
                        <Image src={city.logoImage} alt={`${city.name} logo`} width={96} height={96} className="object-contain" />
                    ) : (
                        <Building2 className="w-24 h-24 text-gray-400" />
                    )}
                    <div className="text-center md:text-left">
                        <h1 className="text-3xl font-bold">{city.name}</h1>
                        <div className="text-md text-gray-600">
                            {t('councilMeetingsTracked', { count: city.councilMeetings.length })}
                        </div>
                        <div>
                            {city.officialSupport ? (
                                <Badge variant="secondary" className="mt-2 gap-1 bg-green-100 text-green-800 hover:bg-green-100">
                                    <BadgeCheck className="w-4 h-4" />
                                    <span>Με την υποστήριξη {city.authorityType == "municipality" ? "του δήμου" : "της περιφέρειας"}</span>
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="mt-2 gap-1 text-muted-foreground">
                                    <BadgeX className="w-4 h-4" />
                                    <span>Χωρίς επίσημη υποστήριξη {city.authorityType == "municipality" ? "του δήμου" : "της περιφέρειας"}</span>
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
                {canEdit && (
                    <FormSheet FormComponent={CityForm} formProps={{ city, onSuccess: () => setIsSheetOpen(false) }} title={t('editCity')} type="edit" />
                )}
            </div>

            <form onSubmit={handleSearch} className="relative mb-8">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                    placeholder={t('searchInCity', { cityName: city.name })}
                    className="pl-10 w-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </form>

            <Suspense fallback={<div className="flex justify-center items-center h-full">
                <Loader2 className="w-4 h-4 animate-spin" />
            </div>}>
                <Tabs defaultValue="meetings">
                    <div className="flex justify-center mb-8">
                        <TabsList className="gap-8">
                            <TabsTrigger value="meetings">{t('councilMeetings')}</TabsTrigger>
                            <TabsTrigger value="members">{t('members')}</TabsTrigger>
                            <TabsTrigger value="parties">{t('parties')}</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="meetings">
                        <List
                            items={orderedMeetings}
                            editable={canEdit}
                            ItemComponent={MeetingCard}
                            FormComponent={AddMeetingForm}
                            formProps={{ cityId: city.id }}
                            t={useTranslations('CouncilMeeting')}
                            smColumns={1}
                            mdColumns={2}
                            lgColumns={3}
                        />
                    </TabsContent>

                    <TabsContent value="members">
                        <List
                            items={orderedPersons}
                            editable={canEdit}
                            ItemComponent={PersonCard}
                            FormComponent={PersonForm}
                            formProps={{ cityId: city.id, parties: city.parties }}
                            t={useTranslations('Person')}
                            smColumns={1}
                            mdColumns={2}
                            lgColumns={3}
                        />
                    </TabsContent>

                    <TabsContent value="parties">
                        <List
                            items={orderedParties}
                            editable={canEdit}
                            ItemComponent={PartyCard}
                            FormComponent={PartyForm}
                            formProps={{ cityId: city.id }}
                            t={useTranslations('Party')}
                            smColumns={1}
                            mdColumns={2}
                            lgColumns={3}
                        />
                    </TabsContent>
                </Tabs>
            </Suspense>
        </div>
    );
}