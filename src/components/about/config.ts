import { Search, Bell, Map, FileText, Mic2, ScrollText, Scale, Printer, Video, Clock, Megaphone, Rocket, Languages, PhoneCall, Users, Landmark } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Realm } from '@prisma/client'
import shotManifest from '../../../public/about/shots/manifest.json'

// ─── Types ───────────────────────────────────────────────────────────────────

export type FeatureStatus = 'live' | 'upcoming'

export interface Feature {
    id: string
    status: FeatureStatus
    demoUrl?: string
    demoUrlByRealm?: Partial<Record<Realm, string>>
    icon?: LucideIcon
}

export function demoUrlForRealm(feature: Feature, realm: Realm): string | undefined {
    return feature.demoUrlByRealm?.[realm] ?? feature.demoUrl
}

export interface RecognitionItem {
    id: string
    logoUrl?: string
    linkUrl: string
    /** Per-logo optical sizing within the fixed logo lockup (logos have very different
     *  aspect ratios, so each is tuned by eye to sit at a balanced visual weight). */
    logoClassName?: string
}

/**
 * Which scenario the /explain mockups (search results, map pins) illustrate. The
 * mockups name real streets, people and funding programmes, so a realm that
 * shows Chania and ΕΣΠΑ grants reads as wrong outside Greece. A realm with no
 * scenario of its own falls back to another one, as `demoUrlByRealm` does.
 */
export type DemoScenario = 'greece' | 'france' | 'serbia'

export interface TeamMember {
    id: string
    image: string
    socials: {
        linkedin?: string
        twitter?: string
        email?: string
    }
}

// ─── Product screenshots ─────────────────────────────────────────────────────

/**
 * The screenshots the page shows are real captures of the product, one set per
 * realm, taken by `scripts/capture-about-shots.mjs` from that realm's demo or
 * flagship city. The script writes the manifest; nothing here is typed by hand.
 */
export const SHOT_NAMES = [
    'hero-desktop',
    'staff-transcript',
    'mobile-subject',
    'mobile-transcript',
    'mobile-search',
    'mobile-map',
] as const

export type ShotName = (typeof SHOT_NAMES)[number]

/** An image with its intrinsic size, as next/image wants it. */
export interface Shot {
    src: string
    width: number
    height: number
}

export interface RealmShots {
    shots: Record<ShotName, Shot>
    /**
     * The subject page the hero shows, on this realm's own domain, without a
     * locale prefix (the i18n Link adds one). Undefined when the realm borrows
     * another realm's shots: a link to a city on another realm's domain is a 404.
     */
    subjectPath?: string
}

interface ShotManifest {
    [realm: string]: {
        subject: string
        files: Record<string, { file: string; width: number; height: number }>
    }
}

const manifest = shotManifest as ShotManifest

/** The realm whose shots stand in for a realm that has none of its own. */
const FALLBACK_SHOT_REALM: Realm = 'greece'

/** `/fr/rennes/...` → `/rennes/...`: captured URLs carry the realm's locale prefix. */
const stripLocalePrefix = (pathname: string) => pathname.replace(/^\/(?:en|el|fr|sr|lat)(?=\/)/, '')

export function shotsForRealm(realm: Realm): RealmShots {
    const own = realm in manifest
    const entry = manifest[own ? realm : FALLBACK_SHOT_REALM]
    const dir = own ? realm : FALLBACK_SHOT_REALM
    const shots = Object.fromEntries(
        SHOT_NAMES.map((name) => {
            const file = entry.files[name]
            return [name, { src: `/about/shots/${dir}/${file.file}`, width: file.width, height: file.height }]
        }),
    ) as Record<ShotName, Shot>
    return { shots, subjectPath: own ? stripLocalePrefix(entry.subject) : undefined }
}

// ─── Sections ────────────────────────────────────────────────────────────────

/** The hero's two lines, one per audience: the page's two halves in one breath. */
export type HeroAudienceId = 'residents' | 'services';

export const HERO_AUDIENCES: Array<{ id: HeroAudienceId; icon: LucideIcon }> = [
    { id: 'residents', icon: Users },
    { id: 'services', icon: Landmark },
]

// Literal unions rather than `(typeof IDS)[number]`: translation-key-references.test.ts reads
// the members off the type to check every one has its copy.
export type ResidentFeatureId = 'subjects' | 'search' | 'notifications' | 'map';

export interface ResidentFeature {
    id: ResidentFeatureId
    icon: LucideIcon
    /** The phone screenshot the card shows; the notifications card draws a WhatsApp message instead. */
    shot?: ShotName
    /** How far down the screenshot the card starts, as a share of its width (the map card skips the page header). */
    offsetPct?: number
}

export const RESIDENT_FEATURES: ResidentFeature[] = [
    { id: 'subjects', icon: FileText, shot: 'mobile-subject' },
    { id: 'search', icon: Search, shot: 'mobile-search' },
    { id: 'notifications', icon: Bell },
    { id: 'map', icon: Map, shot: 'mobile-map', offsetPct: 100 },
]

/** Where each resident card's "see it live" link goes on a realm; undefined hides the link. */
export function residentDemoHref(id: ResidentFeatureId, realmShots: RealmShots): string | undefined {
    switch (id) {
        case 'subjects':
            return realmShots.subjectPath
        case 'search':
            return '/search'
        case 'notifications':
            return '/notifications'
        case 'map':
            return '/'
    }
}

export type ServiceFeatureId = 'transcription' | 'minutes' | 'diavgeia' | 'printArchive';

export interface ServiceFeature {
    id: ServiceFeatureId
    icon: LucideIcon
    /** Shown only on these realms; Diavgeia is a Greek institution. */
    realms?: Realm[]
    status: FeatureStatus
}

export const SERVICE_FEATURES: ServiceFeature[] = [
    { id: 'transcription', icon: Mic2, status: 'live' },
    { id: 'minutes', icon: ScrollText, status: 'live' },
    { id: 'diavgeia', icon: Scale, realms: ['greece'], status: 'upcoming' },
    { id: 'printArchive', icon: Printer, status: 'live' },
]

export function serviceFeaturesForRealm(realm: Realm): ServiceFeature[] {
    return SERVICE_FEATURES.filter((feature) => !feature.realms || feature.realms.includes(realm))
}

export type ProcessStepId = 'record' | 'hours' | 'publish';

export const PROCESS_STEPS: Array<{ id: ProcessStepId; icon: LucideIcon }> = [
    { id: 'record', icon: Video },
    { id: 'hours', icon: Clock },
    { id: 'publish', icon: Megaphone },
]

export type PilotPointId = 'setup' | 'language' | 'contact';

export const PILOT_POINTS: Array<{ id: PilotPointId; icon: LucideIcon }> = [
    { id: 'setup', icon: Rocket },
    { id: 'language', icon: Languages },
    { id: 'contact', icon: PhoneCall },
]

// ─── /explain demos ──────────────────────────────────────────────────────────
// The /explain page still shows the drawn mockups of these features; /about
// shows the real product instead.

export const DEMO_SCENARIO_BY_REALM: Record<Realm, DemoScenario> = {
    greece: 'greece',
    // Cyprus has no scenario of its own yet. The Greek one at least speaks the
    // right language, which no other scenario does.
    cyprus: 'greece',
    france: 'france',
    serbia: 'serbia',
}

/** Center and zoom of the static map tile behind the map mockup, per scenario. */
export const DEMO_MAP_VIEWS: Record<DemoScenario, { lng: number; lat: number; zoom: number }> = {
    greece: { lng: 24.0186, lat: 35.5138, zoom: 14.5 },  // Chania
    france: { lng: -1.6795, lat: 48.1125, zoom: 14.5 },  // Rennes
    serbia: { lng: 20.4630, lat: 44.8155, zoom: 14.5 },  // Belgrade, Stari Grad
}

export const OPENNESS_FEATURE_IDS = ['subjects', 'search', 'notifications', 'map'] as const

export const OPENNESS_FEATURES: Feature[] = [
    {
        id: 'subjects',
        status: 'live',
        demoUrl: '/chania/apr29_2026/subjects/cmocx5sqp03k4grw512nudanu',
        demoUrlByRealm: { france: '/rennes/apr27_2026/subjects/cmqqzisrq02cvf0yhn637jfr7' },
    },
    {
        id: 'search',
        status: 'live',
        demoUrl: '/search',
        demoUrlByRealm: { france: '/search' },
    },
    {
        id: 'notifications',
        status: 'live',
        demoUrl: '/athens/notifications',
        demoUrlByRealm: { france: '/rennes/notifications' },
    },
    {
        id: 'map',
        status: 'live',
        // the map lives on the landing page now, not the standalone /map route
        demoUrl: '/',
        demoUrlByRealm: { france: '/' },
    },
]

// ─── Proof and people ────────────────────────────────────────────────────────

export const RECOGNITION_ITEMS: RecognitionItem[] = [
    {
        id: 'ministryAward',
        linkUrl: '',
    },
    {
        id: 'epsa',
        linkUrl: 'https://www.eipa.eu/epsa-2025-26/',
        logoUrl: '/about/eipa.png',
        logoClassName: 'max-h-7 max-w-[128px]',
    },
    {
        id: 'innovationInPolitics',
        linkUrl: 'https://event.innovationinpolitics.eu/InnovationinPoliticsAwards2026#/Finalists?lang=en',
        logoUrl: '/about/innovation-politics-figure.png',
        logoClassName: 'max-h-10 max-w-[56px]',
    },
    {
        id: 'oecd',
        linkUrl: 'https://oecd.ai/en/gov/issues/civic-engagement-open-government',
        logoUrl: '/about/oecd.png',
        logoClassName: 'max-h-6 max-w-[104px]',
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
        logoClassName: 'max-h-5 max-w-[104px]',
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
        id: 'myrto',
        image: '/people/myrto.jpg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/myrto-plemmenou/',
            email: 'mailto:myrto@opencouncil.gr',
        },
    },
]

export const ROADMAP_ITEM_IDS = ['diavgeia', 'budgets'] as const

/** Roadmap items that only make sense on a realm: Diavgeia decisions are Greek. */
export const ROADMAP_ITEM_REALMS: Partial<Record<(typeof ROADMAP_ITEM_IDS)[number], Realm[]>> = {
    diavgeia: ['greece'],
}

export const OFFICE = {
    mapsUrl: 'https://maps.app.goo.gl/o1k1gqz9uiqw9FmW9',
    email: 'space@opencouncil.gr',
    image: '/about/office.jpg',
}

export const GITHUB_REPO_URL = 'https://github.com/schemalabz/opencouncil'
export const ROADMAP_URL = 'https://github.com/orgs/schemalabz/projects/1'
