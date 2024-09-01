"use client";
import { City, CouncilMeeting } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import AddMeetingForm from "@/components/meetings/AddMeetingForm";
import { Link } from '@/i18n/routing';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function CityC({ city, editable }: { city: City & { councilMeetings: CouncilMeeting[] }, editable: boolean }) {
    const t = useTranslations('City');
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex items-center space-x-6 mb-8">
                <img src={city.logoImage} alt={`${city.name} logo`} className="w-24 h-24 object-contain" />
                <div>
                    <h1 className="text-4xl font-bold">{city.name}</h1>
                    <span className="text-xl text-gray-600">
                        {city.councilMeetings.length} {t('councilMeetingsTracked')}
                    </span>
                </div>
            </div>

            <Tabs defaultValue="meetings">
                <div className="flex justify-center mb-8">
                    <TabsList className="gap-8">
                        <TabsTrigger value="meetings">{t('councilMeetings')}</TabsTrigger>
                        <TabsTrigger value="members">{t('members')}</TabsTrigger>
                        <TabsTrigger value="parties">{t('parties')}</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="meetings">
                    <div className="grid gap-6">
                        {city.councilMeetings.map(meeting => (
                            <Link key={meeting.id} href={`/${city.id}/meetings/${meeting.id}`}>
                                <Card className="hover:bg-gray-100 transition-colors">
                                    <CardHeader>
                                        <CardTitle>{meeting.name}</CardTitle>
                                        <CardDescription>{new Date(meeting.dateTime).toLocaleDateString()}</CardDescription>
                                    </CardHeader>
                                </Card>
                            </Link>
                        ))}
                    </div>

                    {editable && (
                        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                            <SheetTrigger asChild>
                                <Button className="mt-6">{t('addCouncilMeeting')}</Button>
                            </SheetTrigger>
                            <SheetContent>
                                <SheetHeader>
                                    <SheetTitle>{t('addCouncilMeeting')}</SheetTitle>
                                </SheetHeader>
                                <AddMeetingForm cityId={city.id} onSuccess={() => setIsSheetOpen(false)} />
                            </SheetContent>
                        </Sheet>
                    )}
                </TabsContent>

                <TabsContent value="members">
                    <p>{t('membersComingSoon')}</p>
                </TabsContent>

                <TabsContent value="parties">
                    <p>{t('partiesComingSoon')}</p>
                </TabsContent>
            </Tabs>
        </div>
    );
}