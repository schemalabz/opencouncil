import { Mic2, Search, Bell, Map, FileText, ScrollText, Scale, Printer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type FeatureStatus = 'live' | 'upcoming'

export interface Feature {
    id: string
    status: FeatureStatus
    demoUrl?: string
    icon?: LucideIcon
}

export interface RecognitionItem {
    id: string
    logoUrl?: string
    linkUrl: string
}

export interface TeamMember {
    id: string
    image: string
    socials: {
        linkedin?: string
        twitter?: string
        email?: string
    }
}

// ─── Data ────────────────────────────────────────────────────────────────────

export const OPENNESS_FEATURE_IDS = ['subjects', 'search', 'notifications', 'map'] as const

export const OPENNESS_FEATURES: Feature[] = [
    {
        id: 'subjects',
        status: 'live',
        demoUrl: '/chania/mar26_2026/subjects/cmmywhibg07ud139hav10soag',
    },
    {
        id: 'search',
        status: 'live',
        demoUrl: '/search',
    },
    {
        id: 'notifications',
        status: 'live',
        demoUrl: '/athens/notifications',
    },
    {
        id: 'map',
        status: 'live',
        demoUrl: '/map',
    },
]

export const INTERNAL_FEATURES: Feature[] = [
    {
        id: 'transcription',
        status: 'live',
        demoUrl: '/chania/mar26_2026/transcript',
        icon: Mic2,
    },
    {
        id: 'minutes',
        status: 'live',
        icon: ScrollText,
    },
    {
        id: 'diavgeia',
        status: 'upcoming',
        icon: Scale,
    },
    {
        id: 'printArchive',
        status: 'live',
        icon: Printer,
    },
]

export const RECOGNITION_ITEMS: RecognitionItem[] = [
    {
        id: 'ministryAward',
        linkUrl: '',
    },
    {
        id: 'oecd',
        linkUrl: 'https://oecd.ai/en/gov/issues/civic-engagement-open-government',
        logoUrl: '/about/oecd.png',
    },
    {
        id: 'ert',
        linkUrl: 'https://www.ertnews.gr/video/xania-i-texniti-noimosyni-sti-diathesi-tou-dimoti/',
        logoUrl: '/about/ert-news.svg',
    },
    {
        id: 'kede',
        linkUrl: 'https://kede.gr/opencouncil-chania-gr-i-protoporiaki-platforma-ai-pou-allazei-ta-dedomena-sto-dimotiko-symvoulio-chanion/',
        logoUrl: '/about/kede.png',
    },
]

export const TEAM_MEMBERS: TeamMember[] = [
    {
        id: 'christos',
        image: '/people/christos.jpg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/christos-porios-91297690/',
            twitter: 'https://twitter.com/christosporios',
            email: 'mailto:christos@schemalabs.gr',
        },
    },
    {
        id: 'andreas',
        image: '/people/andreas.jpg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/kouloumos/',
            twitter: 'https://twitter.com/kouloumos',
            email: 'mailto:andreas@schemalabs.gr',
        },
    },
    {
        id: 'eliza',
        image: '/people/eliza.jpeg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/egkimitzoudi/',
            email: 'mailto:eliza@schemalabs.gr',
        },
    },
    {
        id: 'thanos',
        image: '/people/thanos.png',
        socials: {
            linkedin: 'https://www.linkedin.com/in/athanasios-papadogiannis-099537195/',
            email: 'mailto:thanos@schemalabs.gr',
        },
    },
    {
        id: 'vasia',
        image: '/people/vasia.jpg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/vasiliki-koumarela/',
        },
    },
    {
        id: 'klea',
        image: '/people/klea.png',
        socials: {
            linkedin: 'https://www.linkedin.com/in/klea-meshi-0980b2370/',
        },
    },
]

export const ROADMAP_ITEM_IDS = ['diavgeia', 'bidirectional', 'fineTuned'] as const

export const ROADMAP_TIMEFRAMES: Record<string, string> = {
    diavgeia: 'Q2 2026',
    bidirectional: 'Q3 2026',
    fineTuned: 'Q3 2026',
}
