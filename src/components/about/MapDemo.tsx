"use client"

import { MapPin, Clock, Users, Filter } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { env } from '@/env.mjs'
import BrowserFrame from './BrowserFrame'

// Chania center coordinates
const CHANIA_LNG = 24.0186
const CHANIA_LAT = 35.5138

const SUBJECT_POSITIONS = [
    { topicColor: '#2563eb', x: 47, y: 32, minutes: 23, speakers: 6 },
    { topicColor: '#dc2626', x: 33, y: 55, minutes: 12, speakers: 4 },
    { topicColor: '#059669', x: 68, y: 62, minutes: 8, speakers: 3 },
    { topicColor: '#7c3aed', x: 40, y: 25, minutes: 15, speakers: 5 },
]

function getStaticMapUrl(width: number, height: number): string {
    const token = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${CHANIA_LNG},${CHANIA_LAT},14.5,0/${width}x${height}@2x?access_token=${token}`
}

export default function MapDemo() {
    const t = useTranslations('about.demos.map')

    return (
        <BrowserFrame url="opencouncil.gr/map" className="w-full">
            {/* Map area */}
            <div className="relative aspect-[4/3] overflow-hidden bg-[#f2efe9]">
                {/* Mapbox static tile background */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={getStaticMapUrl(600, 450)}
                    alt={t('mapAlt')}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                />

                {/* Subject pins as overlays */}
                {SUBJECT_POSITIONS.map((s, i) => (
                    <div
                        key={i}
                        className="absolute -translate-x-1/2 -translate-y-1/2 group/pin cursor-pointer z-10"
                        style={{ left: `${s.x}%`, top: `${s.y}%` }}
                    >
                        {/* Pulse ring */}
                        <div
                            className="absolute inset-[-4px] rounded-full opacity-25"
                            style={{ backgroundColor: s.topicColor }}
                        />
                        {/* Pin dot */}
                        <div
                            className="relative h-3.5 w-3.5 rounded-full border-2 border-white shadow-md"
                            style={{ backgroundColor: s.topicColor }}
                        />
                        {/* Hover tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/pin:block">
                            <div className="bg-white rounded-lg shadow-lg border border-border/40 p-2.5 w-48">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span
                                        className="h-2 w-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: s.topicColor }}
                                    />
                                    <span className="text-[10px] font-medium text-muted-foreground">{t(`subjects.${i}.topic`)}</span>
                                </div>
                                <p className="text-[11px] font-medium leading-snug">{t(`subjects.${i}.title`)}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                    <MapPin className="h-2.5 w-2.5" />
                                    {t(`subjects.${i}.location`)}
                                </p>
                                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                                    <span className="flex items-center gap-0.5">
                                        <Clock className="h-2.5 w-2.5" />
                                        {s.minutes}΄
                                    </span>
                                    <span className="flex items-center gap-0.5">
                                        <Users className="h-2.5 w-2.5" />
                                        {s.speakers}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Filter button (bottom-left) */}
                <div className="absolute bottom-3 left-3 z-10">
                    <div className="flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 shadow-md border border-border/30 text-[11px] font-medium text-muted-foreground">
                        <Filter className="h-3 w-3" />
                        {t('filters')}
                    </div>
                </div>

                {/* Subject count badge (bottom-right) */}
                <div className="absolute bottom-3 right-3 z-10">
                    <div className="bg-black/60 text-white rounded-full px-3 py-1 text-[10px] font-medium backdrop-blur-sm">
                        {t('subjectCount', { count: SUBJECT_POSITIONS.length })}
                    </div>
                </div>

                {/* Zoom controls (top-right) */}
                <div className="absolute top-3 right-3 z-10 flex flex-col shadow-md rounded-lg overflow-hidden border border-border/30">
                    <div className="bg-white hover:bg-gray-50 px-2 py-1 text-sm font-bold text-gray-600 border-b border-border/30 text-center cursor-default">+</div>
                    <div className="bg-white hover:bg-gray-50 px-2 py-1 text-sm font-bold text-gray-600 text-center cursor-default">−</div>
                </div>
            </div>
        </BrowserFrame>
    )
}
