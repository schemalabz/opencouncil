"use client";
import { AdministrativeBody, City, CouncilMeeting, Party, Person, Subject, Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Suspense, useEffect, useState, useMemo } from 'react';
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
import { motion, useScroll, useTransform } from 'framer-motion';
import { PersonWithRelations } from '@/lib/getMeetingData';
import { PartyWithPersons } from '@/lib/db/parties';
import { sortPersonsByLastName } from '@/components/utils';

export default function CityC({ city }: {
    city: City & {
        councilMeetings: (CouncilMeeting & { subjects: SubjectWithRelations[], administrativeBody: AdministrativeBody | null })[],
        parties: Party[],
        persons: PersonWithRelations[]
    }
}) {
    const t = useTranslations('City');
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const router = useRouter();
    const [canEdit, setCanEdit] = useState(false);
    const { scrollY } = useScroll();
    const headerOpacity = useTransform(scrollY, [0, 200], [1, 0.8]);

    // Reconstruct parties with their roles from persons data
    const partiesWithRoles = useMemo(() => {
        const partyMap = new Map(city.parties.map(party => [party.id, { ...party, roles: [] as any[] }]));

        city.persons.forEach(person => {
            person.roles.forEach(role => {
                if (role.partyId) {
                    const party = partyMap.get(role.partyId);
                    if (party) {
                        party.roles.push({
                            ...role,
                            party,
                            person: {
                                ...person,
                                roles: person.roles.map(r => ({
                                    ...r,
                                    party: r.partyId ? partyMap.get(r.partyId) : null
                                }))
                            }
                        });
                    }
                }
            });
        });

        return Array.from(partyMap.values()) as PartyWithPersons[];
    }, [city.parties, city.persons]);

    const administrativeBodies = Array.from(new Map(city.councilMeetings
        .map(meeting => [
            meeting.administrativeBody?.id,
            {
                value: meeting.administrativeBody?.id,
                label: meeting.administrativeBody?.name || "Χωρίς διοικητικό όργανο"
            }
        ])
    ).values());

    const peopleAdministrativeBodies = [
        ...Array.from(new Map(
            city.persons
                .flatMap(person => person.roles
                    .filter(role => role.administrativeBody)
                    .map(role => [
                        role.administrativeBody!.id,
                        {
                            value: role.administrativeBody!.id,
                            label: role.administrativeBody!.name
                        }
                    ])
                )
        ).values()),
        ...(city.persons.some(person => person.roles.some(role => !role.administrativeBody)) ? [{
            value: null,
            label: "Χωρίς διοικητικό όργανο"
        }] : [])
    ];

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

    const orderedPersons = sortPersonsByLastName(city.persons)

    const orderedParties = [...partiesWithRoles]
        .sort((a, b) => {
            // Sort by member count first
            const memberCountDiff = b.roles.length - a.roles.length;
            if (memberCountDiff !== 0) return memberCountDiff;

            // If same member count, sort by party head
            const aHasHead = a.roles.some(role => role.isHead);
            const bHasHead = b.roles.some(role => role.isHead);
            if (aHasHead && !bHasHead) return -1;
            if (!aHasHead && bHasHead) return 1;

            // If still tied, sort by name
            return a.name.localeCompare(b.name);
        });

    return (
        <div className="relative min-h-screen">
            {/* Main Content */}
            <div className="relative md:container md:mx-auto py-8 px-4 md:px-8 space-y-8 z-0">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >

                    {/* Hero Section */}
                    <div className="flex flex-col md:flex-row items-center justify-between mb-8 md:mb-12 gap-6">
                        <motion.div
                            className="flex flex-col md:flex-row items-center gap-6 md:space-x-8"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5 }}
                        >
                            <div className="relative w-32 h-32 md:w-40 md:h-40">
                                {city.logoImage ? (
                                    <Image
                                        src={city.logoImage}
                                        alt={`${city.name} logo`}
                                        fill
                                        className="object-contain"
                                    />
                                ) : (
                                    <Building2 className="w-full h-full text-gray-400" />
                                )}
                            </div>
                            <div className="text-center md:text-left space-y-3">
                                <motion.h1
                                    className="text-4xl md:text-5xl font-normal tracking-tight"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    {city.name}
                                </motion.h1>
                                <motion.div
                                    className="text-lg text-muted-foreground"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.3 }}
                                >
                                    {t('councilMeetingsTracked', { count: city.councilMeetings.length })}
                                </motion.div>
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                >
                                    {city.officialSupport ? (
                                        <Badge variant="secondary" className="mt-2 gap-2 bg-green-100/80 text-green-800 hover:bg-green-100">
                                            <BadgeCheck className="w-4 h-4" />
                                            <span>Με την υποστήριξη {city.authorityType == "municipality" ? "του δήμου" : "της περιφέρειας"}</span>
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="mt-2 gap-2 text-muted-foreground">
                                            <BadgeX className="w-4 h-4" />
                                            <span>Χωρίς επίσημη υποστήριξη {city.authorityType == "municipality" ? "του δήμου" : "της περιφέρειας"}</span>
                                        </Badge>
                                    )}
                                </motion.div>
                            </div>
                        </motion.div>
                        {canEdit && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.5 }}
                            >
                                <FormSheet
                                    FormComponent={CityForm}
                                    formProps={{ city, onSuccess: () => setIsSheetOpen(false) }}
                                    title={t('editCity')}
                                    type="edit"
                                />
                            </motion.div>
                        )}
                    </div>

                    {/* Search Section */}
                    <motion.form
                        onSubmit={handleSearch}
                        className="relative mb-8 md:mb-12 max-w-2xl mx-auto"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                    >
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            placeholder={t('searchInCity', { cityName: city.name })}
                            className="pl-12 py-6 text-lg rounded-xl shadow-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </motion.form>

                    {/* Tabs Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                    >
                        <Suspense fallback={
                            <div className="flex justify-center items-center h-32">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                        }>
                            <Tabs defaultValue="meetings" className="space-y-6 md:space-y-8">
                                <div className="flex justify-center">
                                    <TabsList className="gap-2 sm:gap-8 p-1 bg-background/80 backdrop-blur-sm w-full flex justify-center">
                                        <TabsTrigger value="meetings" className="px-3 sm:px-6 py-2 text-sm sm:text-base whitespace-nowrap">
                                            {t('councilMeetings')}
                                        </TabsTrigger>
                                        <TabsTrigger value="members" className="px-3 sm:px-6 py-2 text-sm sm:text-base whitespace-nowrap">
                                            {t('members')}
                                        </TabsTrigger>
                                        <TabsTrigger value="parties" className="px-3 sm:px-6 py-2 text-sm sm:text-base whitespace-nowrap">
                                            {t('parties')}
                                        </TabsTrigger>
                                    </TabsList>
                                </div>

                                <TabsContent value="meetings" className="space-y-4 md:space-y-6">
                                    <List
                                        items={orderedMeetings}
                                        editable={canEdit}
                                        ItemComponent={MeetingCard}
                                        FormComponent={AddMeetingForm}
                                        formProps={{ cityId: city.id }}
                                        t={useTranslations('CouncilMeeting')}
                                        filterAvailableValues={administrativeBodies}
                                        filter={(selectedValues, meeting) => selectedValues.includes(meeting.administrativeBody?.id)}
                                        smColumns={1}
                                        mdColumns={2}
                                        lgColumns={3}
                                    />
                                </TabsContent>

                                <TabsContent value="members" className="space-y-4 md:space-y-6">
                                    <List
                                        items={orderedPersons}
                                        editable={canEdit}
                                        ItemComponent={PersonCard}
                                        FormComponent={PersonForm}
                                        formProps={{ cityId: city.id, parties: city.parties }}
                                        t={useTranslations('Person')}
                                        filterAvailableValues={peopleAdministrativeBodies}
                                        filter={(selectedValues, person) =>
                                            selectedValues.length === 0 ||
                                            (selectedValues.includes(null) && !person.roles.some(role => role.administrativeBody)) ||
                                            person.roles.some(role =>
                                                role.administrativeBody && selectedValues.includes(role.administrativeBody.id)
                                            )
                                        }
                                        smColumns={1}
                                        mdColumns={2}
                                        lgColumns={3}
                                    />
                                </TabsContent>

                                <TabsContent value="parties" className="space-y-4 md:space-y-6">
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
                    </motion.div>
                </motion.div>
            </div>
        </div>
    );
}