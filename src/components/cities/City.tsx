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
import { BadgeCheck, BadgeX, Loader2 } from 'lucide-react';
import { Search } from "lucide-react";
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { SubjectWithRelations } from '@/lib/db/subject';
import { isUserAuthorizedToEdit } from '@/lib/auth';

export default function CityC({ city }: { city: City & { councilMeetings: (CouncilMeeting & { subjects: SubjectWithRelations[] })[], parties: (Party & { persons: Person[] })[], persons: (Person & { party: Party | null })[] } }) {
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

            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                    <Image src={city.logoImage} alt={`${city.name} logo`} width={64} height={64} className="object-contain hidden md:block" />
                    <div>
                        <h1 className="text-3xl font-bold">{city.name}</h1>
                        <span className="text-md text-gray-600">
                            {t('councilMeetingsTracked', { count: city.councilMeetings.length })}
                        </span>
                        {city.officialSupport ? (
                            <div className="flex items-center bg-green-100 text-green-800 text-xs font-medium rounded mt-2">
                                <BadgeCheck className="w-4 h-4 mr-1" />
                                <span>Με την υποστήριξη {city.authorityType == "municipality" ? "του δήμου" : "της περιφέρειας"}</span>
                            </div>
                        ) : (
                            <div className="flex items-center bg-transparent text-muted-foreground text-xs font-medium rounded mt-2">
                                <BadgeX className="w-4 h-4 mr-1" />
                                <span>Χωρίς επίσημη υποστήριξη {city.authorityType == "municipality" ? "του δήμου" : "της περιφέρειας"}</span>
                            </div>
                        )}
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
                            items={canEdit ? city.councilMeetings : city.councilMeetings.filter(meeting => meeting.released).sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())}
                            editable={canEdit}
                            ItemComponent={MeetingCard}
                            FormComponent={AddMeetingForm}
                            formProps={{ cityId: city.id }}
                            t={useTranslations('CouncilMeeting')}
                        />
                    </TabsContent>

                    <TabsContent value="members">
                        <List
                            items={city.persons}
                            editable={canEdit}
                            ItemComponent={PersonCard}
                            FormComponent={PersonForm}
                            formProps={{ cityId: city.id, parties: city.parties }}
                            t={useTranslations('Person')}
                        />
                    </TabsContent>

                    <TabsContent value="parties">
                        <List
                            items={city.parties}
                            editable={canEdit}
                            ItemComponent={PartyCard}
                            FormComponent={PartyForm}
                            formProps={{ cityId: city.id }}
                            t={useTranslations('Party')}
                        />
                    </TabsContent>
                </Tabs>
            </Suspense>
        </div>
    );
}