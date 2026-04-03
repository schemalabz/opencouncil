"use client"

import { MapPin, Clock, Users, Filter } from 'lucide-react'
import { env } from '@/env.mjs'
import BrowserFrame from './BrowserFrame'

// Chania center coordinates
const CHANIA_LNG = 24.0186
const CHANIA_LAT = 35.5138

const MOCK_SUBJECTS = [
    {
        title: 'Ανάπλαση πλατείας Δημοτικής Αγοράς',
        location: 'Πλ. Δημοτικής Αγοράς',
        topic: 'Τεχνικά Έργα',
        topicColor: '#2563eb',
        lng: 24.0180,
        lat: 35.5155,
        x: 47,  // % position on the rendered image
        y: 32,
        minutes: 23,
        speakers: 6,
    },
    {
        title: 'Κυκλοφοριακές ρυθμίσεις οδού Σκαλίδη',
        location: 'Οδός Σκαλίδη',
        topic: 'Κυκλοφορία',
        topicColor: '#dc2626',
        lng: 24.0138,
        lat: 35.5128,
        x: 33,
        y: 55,
        minutes: 12,
        speakers: 4,
    },
    {
        title: 'Αδειοδότηση καταστήματος',
        location: 'Λ. Χαλέπα 15',
        topic: 'Αδειοδοτήσεις',
        topicColor: '#059669',
        lng: 24.0245,
        lat: 35.5118,
        x: 68,
        y: 62,
        minutes: 8,
        speakers: 3,
    },
    {
        title: 'Συντήρηση σχολικού κτιρίου',
        location: '4ο Δημοτικό',
        topic: 'Παιδεία',
        topicColor: '#7c3aed',
        lng: 24.0160,
        lat: 35.5165,
        x: 40,
        y: 25,
        minutes: 15,
        speakers: 5,
    },
]

function getStaticMapUrl(width: number, height: number): string {
    const token = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${CHANIA_LNG},${CHANIA_LAT},14.5,0/${width}x${height}@2x?access_token=${token}`
}

export default function MapDemo() {
    return (
        <BrowserFrame url="opencouncil.gr/map" className="w-full">
            {/* Map area */}
            <div className="relative aspect-[4/3] overflow-hidden bg-[#f2efe9]">
                {/* Mapbox static tile background */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={getStaticMapUrl(600, 450)}
                    alt="Χάρτης Χανίων"
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                />

                {/* Subject pins as overlays */}
                {MOCK_SUBJECTS.map((s, i) => (
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
                                    <span className="text-[10px] font-medium text-muted-foreground">{s.topic}</span>
                                </div>
                                <p className="text-[11px] font-medium leading-snug">{s.title}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                    <MapPin className="h-2.5 w-2.5" />
                                    {s.location}
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
                        Φίλτρα
                    </div>
                </div>

                {/* Subject count badge (bottom-right) */}
                <div className="absolute bottom-3 right-3 z-10">
                    <div className="bg-black/60 text-white rounded-full px-3 py-1 text-[10px] font-medium backdrop-blur-sm">
                        {MOCK_SUBJECTS.length} θέματα · Τελευταίοι 6 μήνες
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
