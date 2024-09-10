'use client'
import { City, CouncilMeeting } from '@prisma/client';
import Image from 'next/image';
import { Card, CardContent } from "../ui/card";
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

interface CityCardProps {
    city: City & { councilMeetings: CouncilMeeting[] };
}

export function CityCard({ city }: CityCardProps) {
    let locale = useLocale();
    let localizedName = locale === 'en' ? city.name_en : city.name;
    const router = useRouter();
    const t = useTranslations('City');

    const handleClick = () => {
        router.push(`/${city.id}`);
    };

    return (
        <div onClick={handleClick} className="cursor-pointer">
            <Card className="relative h-48 overflow-hidden transition-transform hover:scale-105">
                <div className="absolute inset-0 flex items-center justify-center">
                    <Image
                        src={city.logoImage || '/default-city-logo.jpg'}
                        alt={`${localizedName} logo`}
                        layout="fill"
                        objectFit="contain"
                        className="opacity-20"
                    />
                </div>
                <CardContent className="relative h-full flex flex-col justify-start">
                    <h3 className="text-xl md:text-2xl font-bold text-center z-10">{localizedName}</h3>
                    <span className="text-md md:text-lg z-10 text-center">{t('councilMeetingsTracked', { count: city.councilMeetings.length })}</span>
                </CardContent>
            </Card>
        </div>
    );
}