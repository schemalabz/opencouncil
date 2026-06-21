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
    /** Per-logo optical sizing within the fixed logo lockup (logos have very different
     *  aspect ratios, so each is tuned by eye to sit at a balanced visual weight). */
    logoClassName?: string
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
        demoUrl: '/chania/apr29_2026/subjects/cmocx5sqp03k4grw512nudanu',
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
        logoClassName: 'max-h-7 max-w-[116px]',
    },
    {
        id: 'innovationInPolitics',
        linkUrl: 'https://event.innovationinpolitics.eu/InnovationinPoliticsAwards2026#/Finalists?lang=en',
        logoUrl: '/about/innovation-politics-figure.png',
        logoClassName: 'max-h-11 max-w-[64px]',
    },
    {
        id: 'epsa',
        linkUrl: 'https://www.eipa.eu/epsa-2025-26/',
        logoUrl: '/about/eipa.png',
        logoClassName: 'max-h-8 max-w-[128px]',
    },
    {
        id: 'kede',
        linkUrl: 'https://kede.gr/opencouncil-chania-gr-i-protoporiaki-platforma-ai-pou-allazei-ta-dedomena-sto-dimotiko-symvoulio-chanion/',
        logoUrl: '/about/kede.png',
        logoClassName: 'max-h-10 max-w-[56px]',
    },
    {
        id: 'wired',
        linkUrl: 'https://wired.com.gr/article/ai-kai-dimotika-symvoulia-stin-akri-tis-elladas/',
        logoUrl: '/about/wired.svg',
        logoClassName: 'max-h-6 max-w-[112px]',
    },
]

export const TEAM_MEMBERS: TeamMember[] = [
    {
        id: 'christos',
        image: '/people/christos.jpg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/christos-porios-91297690/',
            twitter: 'https://twitter.com/christosporios',
            email: 'mailto:christos@opencouncil.gr',
        },
    },
    {
        id: 'andreas',
        image: '/people/andreas.jpg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/kouloumos/',
            twitter: 'https://twitter.com/kouloumos',
            email: 'mailto:andreas@opencouncil.gr',
        },
    },
    {
        id: 'eliza',
        image: '/people/eliza.jpeg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/egkimitzoudi/',
            email: 'mailto:eliza@opencouncil.gr',
        },
    },
    {
        id: 'thanos',
        image: '/people/thanos.png',
        socials: {
            linkedin: 'https://www.linkedin.com/in/athanasios-papadogiannis-099537195/',
            email: 'mailto:thanos@opencouncil.gr',
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
        id: 'myrto',
        image: '/people/myrto.jpg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/myrto-plemmenou/',
            email: 'mailto:myrto@opencouncil.gr',
        },
    },
    {
        id: 'alexandra',
        image: '/people/alexandra.jpg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/alexandra-ranunkel-1a621026b/',
            email: 'mailto:alexandra@opencouncil.gr',
        },
    },
]

export const ROADMAP_ITEM_IDS = ['diavgeia', 'bidirectional', 'fineTuned'] as const

export const ROADMAP_TIMEFRAMES: Record<typeof ROADMAP_ITEM_IDS[number], string> = {
    diavgeia: 'Q2 2026',
    bidirectional: 'Q3 2026',
    fineTuned: 'Q3 2026',
}
