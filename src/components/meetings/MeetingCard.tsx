import { CouncilMeeting } from '@prisma/client';
import { Link } from '../../i18n/routing';
import Image from 'next/image';
import { useState } from 'react';
import { Card, CardContent, CardFooter } from "../ui/card";
import { useTranslations } from 'next-intl';
import React from 'react';

interface MeetingCardProps {
    item: CouncilMeeting;
    editable: boolean;
}

export default function MeetingCard({ item: meeting, editable }: MeetingCardProps) {
    const t = useTranslations('MeetingCard');

    return (
        <Card className="relative h-48 overflow-hidden transition-transform border-l-8" style={{ borderColor: meeting.released ? 'green' : 'red' }}>
            <CardContent className="relative h-full flex flex-col justify-center">
                <div className="flex items-center space-x-4">
                    <h3 className="text-2xl font-bold">{meeting.name}</h3>
                </div>
                <p className="mt-2">
                    {t('meetingDate')}: {new Date(meeting.dateTime).toLocaleDateString()}
                </p>
            </CardContent>
            <CardFooter>
                {editable && <Link href={`/meetings/edit/${meeting.id}`} className="text-blue-500 underline">{t('editMeeting')}</Link>}
            </CardFooter>
        </Card>
    );
}

interface MeetingLogoProps {
    videoUrl: string;
    width: number;
    height: number;
}


