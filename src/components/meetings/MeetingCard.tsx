'use client'
import { CouncilMeeting } from '@prisma/client';
import { useRouter } from '../../i18n/routing';
import { Card, CardContent, CardFooter } from "../ui/card";
import { useLocale, useTranslations } from 'next-intl';
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { el, enUS } from 'date-fns/locale';
import { getStatisticsFor, StatisticsOfCouncilMeeting } from '@/lib/statistics';
import { Loader2 } from 'lucide-react';

interface MeetingCardProps {
    item: CouncilMeeting;
    editable: boolean;
}

export default function MeetingCard({ item: meeting, editable }: MeetingCardProps) {
    const t = useTranslations('MeetingCard');
    const router = useRouter();
    const locale = useLocale();
    const [statistics, setStatistics] = useState<StatisticsOfCouncilMeeting | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = () => {
        setIsLoading(true);
        router.push(`/${meeting.cityId}/${meeting.id}`);
    };

    const handleEditClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        router.push(`/meetings/edit/${meeting.id}`);
    };

    const getStatistics = () => {
        getStatisticsFor({ meetingId: meeting.id, cityId: "athens" }, ['person', 'topic', 'party']).then((statistics) => {
            setStatistics(statistics as StatisticsOfCouncilMeeting);
        });
    }
    useEffect(() => {
        getStatistics();
    }, []);


    return (
        <Card
            className="relative h-48 overflow-hidden transition-transform hover:shadow-lg cursor-pointer"
            onClick={handleClick}
        >
            {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            ) : (
                <>
                    <CardContent className="relative h-full flex flex-col justify-start pt-4">
                        <div className="flex items-center space-x-4">
                            <h3 className="text-2xl font-bold">{meeting.name}</h3>
                        </div>
                        <p className="mt-2 text-muted-foreground">
                            {format(meeting.dateTime, 'EEEE, d MMMM yyyy', { locale: locale === 'el' ? el : enUS })}
                        </p>
                        {statistics &&
                            <p className='animate-fade-in'>
                                {Math.round(statistics.speakingSeconds / 60)} λεπτά ομιλίας, από {statistics.people?.length} ομιλητές {statistics.parties?.length} παρατάξεων.
                            </p>
                        }
                    </CardContent>
                    <CardFooter>
                        {editable && (
                            <button
                                className="text-blue-500 underline"
                                onClick={handleEditClick}
                            >
                                {t('editMeeting')}
                            </button>
                        )}
                    </CardFooter>
                </>
            )}
        </Card>
    );
}
