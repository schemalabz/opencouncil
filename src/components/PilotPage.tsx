"use client";

import { City, CouncilMeeting } from "@prisma/client";
import { CityCard } from "./cities/CityCard";
import CityForm from "./cities/CityForm";
import List from "./List";
import { useTranslations } from "next-intl";
import GradualSpacing from "./magicui/gradual-spacing";
import DotPattern from "./magicui/dot-pattern";
import NumberTicker from "./magicui/number-ticker";
import { useState, useEffect } from "react";
import { getPilotStats } from "@/lib/pilotStats";
import { Loader2, Podcast, Sparkles } from "lucide-react";
import AnimatedGradientText from "./magicui/animated-gradient-text";

export default function PilotPage({ cities }: { cities: (City & { councilMeetings: CouncilMeeting[] })[] }) {
    const t = useTranslations('PilotPage');
    return (
        <>
            <a href="https://open.spotify.com/episode/5A29fZuy3LUEQprfAlYDwg?si=68297c2f81d34d33" target="_blank" rel="noopener noreferrer">
                <AnimatedGradientText>
                    <Podcast className='inline-block md:mr-2' />
                    <span className='hidden md:inline'>Ακούστε το αυτόματο podcast του OpenCouncil για το δημοτικό συμβούλιο της Αθήνας</span>
                </AnimatedGradientText>
            </a>
            <div className="flex flex-col gap-4 mt-4" id="hero">
                <div className="flex flex-col gap-4 relative">
                    <h1 className='my-16'>
                        <GradualSpacing text={t('promo')} className="text-lg md:text-2xl lg:text-4xl" />
                    </h1>
                    <DotPattern />
                </div>
                <div className="flex lg:flex-row flex-col gap-8 items-center max-w-6xl mx-auto" >
                    <div className="flex flex-1 flex-col">
                        <h2 className='text-2xl text-left'>{t('title')}</h2>
                        <span className='text-xl text-gray-500 text-left'>{t('subtitle')}</span>
                    </div>
                    <div className="flex flex-1 flex-col">
                        {cities.map((city) => (
                            <CityCard key={city.id} city={city} />
                        ))}
                    </div>
                </div >

                <div className="">
                    <PilotStats />
                </div>
            </div >
        </>
    )
}
function PilotStats() {
    const [pilotStats, setPilotStats] = useState<{
        wordCount: number;
        minutesCount: number;
        peopleCount: number;
        meetingsCount: number;
    } | null>(null);
    const t = useTranslations('PilotPage');

    useEffect(() => {
        getPilotStats().then(setPilotStats);
    }, []);

    const statsContent = (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
            <div className="flex flex-col items-center">
                <NumberTicker value={pilotStats?.wordCount ?? 0} className='text-3xl' />
                <span className="mt-2 text-lg font-medium">{t('words')}</span>
            </div>
            <div className="flex flex-col items-center">
                <NumberTicker value={pilotStats?.minutesCount ?? 0} className='text-3xl' />
                <span className="mt-2 text-lg font-medium">{t('minutes')}</span>
            </div>
            <div className="flex flex-col items-center">
                <NumberTicker value={pilotStats?.peopleCount ?? 0} className='text-3xl' />
                <span className="mt-2 text-lg font-medium">{t('people')}</span>
            </div>
        </div>
    );

    return (
        <div className="h-64 md:h-48">
            {!pilotStats ? (
                <div className="flex justify-center items-center w-full h-full">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            ) : statsContent}
        </div>
    );
}

