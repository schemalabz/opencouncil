'use client'
import { City, CouncilMeeting } from '@prisma/client';
import Image from 'next/image';
import { Card, CardContent } from "../ui/card";
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useState } from 'react';
import { BadgeCheck, BadgeX, Loader2 } from 'lucide-react';

interface CityCardProps {
    city: City & { councilMeetings: CouncilMeeting[] };
}

export function CityCard({ city }: CityCardProps) {
    let locale = useLocale();
    let localizedName = locale === 'en' ? city.name_en : city.name;
    const router = useRouter();
    const t = useTranslations('City');
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = () => {
        setIsLoading(true);
        router.push(`/${city.id}`);
    };

    return (
        <div onClick={handleClick} className="cursor-pointer">
            <Card className="relative h-48 overflow-hidden transition-transform hover:scale-105">
                {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
                        <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                ) : (
                    <>
                        <div className="absolute inset-0 flex items-center justify-end">
                            <div className="w-1/2 h-full relative overflow-hidden">
                                <Image
                                    src={city.logoImage || '/default-city-logo.jpg'}
                                    alt={`${localizedName} logo`}
                                    fill
                                    className="opacity-20 object-contain"
                                />
                                <div className="absolute inset-0 bg-gradient-to-l from-transparent to-background"></div>
                            </div>
                        </div>
                        <CardContent className="relative h-full flex flex-col justify-between p-6">
                            <div className="w-1/2">
                                <h3 className="text-xl md:text-2xl font-bold mb-2">{localizedName}</h3>
                                <span className="text-sm md:text-base text-muted-foreground">
                                    {t('councilMeetingsTracked', { count: city.councilMeetings.length })}
                                </span>
                            </div>
                            <div className="absolute bottom-2 right-2">
                                {city.officialSupport ? (
                                    <div className="flex items-center bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1.5 rounded-full">
                                        <BadgeCheck className="w-4 h-4 mr-1.5" />
                                        Με υποστήριξη δήμου
                                    </div>
                                ) : (
                                    <div className="flex items-center bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1.5 rounded-full">
                                        <BadgeX className="w-4 h-4 mr-1.5" />
                                        Χωρίς επίσημη υποστήριξη
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </>
                )}
            </Card>
        </div>
    );
}