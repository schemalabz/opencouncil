"use client";
import { City, CouncilMeeting, Party, Person } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Suspense, useState } from 'react';
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

export default function CityC({ city, editable }: { city: City & { councilMeetings: CouncilMeeting[], parties: (Party & { persons: Person[] })[], persons: (Person & { party: Party | null })[] }, editable: boolean }) {
    const t = useTranslations('City');
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    return (
        <div className="md:container md:mx-auto py-8">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                    <img src={city.logoImage} alt={`${city.name} logo`} className="w-16 h-16 object-contain hidden md:block" />
                    <div>
                        <h1 className="text-3xl font-bold">{city.name}</h1>
                        <span className="text-md text-gray-600">
                            {t('councilMeetingsTracked', { count: city.councilMeetings.length })}
                        </span>
                        {city.officialSupport ? (
                            <div className="flex items-center bg-green-100 text-green-800 text-xs font-medium rounded mt-2">
                                <BadgeCheck className="w-4 h-4 mr-1" />
                                <span>Με την υποστήριξη του δήμου</span>
                            </div>
                        ) : (
                            <div className="flex items-center bg-transparent text-muted-foreground text-xs font-medium rounded mt-2">
                                <BadgeX className="w-4 h-4 mr-1" />
                                <span>Χωρίς επίσημη υποστήριξη του δήμου</span>
                            </div>
                        )}
                    </div>
                </div>
                {editable && (
                    <FormSheet FormComponent={CityForm} formProps={{ city, onSuccess: () => setIsSheetOpen(false) }} title={t('editCity')} type="edit" />
                )}
            </div>

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
                            items={city.councilMeetings}
                            editable={editable}
                            ItemComponent={MeetingCard}
                            FormComponent={AddMeetingForm}
                            formProps={{ cityId: city.id }}
                            t={useTranslations('CouncilMeeting')}
                        />
                    </TabsContent>

                    <TabsContent value="members">
                        <List
                            items={city.persons}
                            editable={editable}
                            ItemComponent={PersonCard}
                            FormComponent={PersonForm}
                            formProps={{ cityId: city.id, parties: city.parties }}
                            t={useTranslations('Person')}
                        />
                    </TabsContent>

                    <TabsContent value="parties">
                        <List
                            items={city.parties}
                            editable={editable}
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