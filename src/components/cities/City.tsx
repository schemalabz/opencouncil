"use client";
import { City, CouncilMeeting } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import AddMeetingForm from "@/components/meetings/AddMeetingForm";

export default function CityC({ city, editable }: { city: City & { councilMeetings: CouncilMeeting[] }, editable: boolean }) {
    const t = useTranslations('City');
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    return <div>
        <h1>{city.name}</h1>

        {city.councilMeetings.map(meeting => (
            <div key={meeting.id}>
                <a href={`/meetings/${meeting.id}`}>{meeting.name}</a>
            </div>
        ))}

        {editable && (
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                    <Button>{t('addCouncilMeeting')}</Button>
                </SheetTrigger>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>{t('addCouncilMeeting')}</SheetTitle>
                    </SheetHeader>
                    <AddMeetingForm cityId={city.id} onSuccess={() => setIsSheetOpen(false)} />
                </SheetContent>
            </Sheet>
        )}
    </div>
}