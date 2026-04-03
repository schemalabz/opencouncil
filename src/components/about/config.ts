import { Mic2, Search, Bell, Map, FileText, ScrollText, Scale, Printer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────────────────────

export type FeatureStatus = 'live' | 'upcoming'

export interface Feature {
    id: string
    title: string
    description: string
    status: FeatureStatus
    demoUrl?: string
    demoLabel?: string
    targetDate?: string
    screenshot?: string
    embedPlaceholder?: boolean
    icon?: LucideIcon
}

export interface HeroCounter {
    value: number
    suffix?: string
    label: string
}

export interface CustomerQuote {
    id: string
    quote: string
    name: string
    role: string
    municipality?: string
    photoUrl?: string
}

export interface RecognitionItem {
    id: string
    title: string
    subtitle: string
    logoUrl?: string
    linkUrl: string
}

export interface TeamMember {
    name: string
    role?: string
    image: string
    socials: {
        linkedin?: string
        twitter?: string
        email?: string
    }
}

export interface RoadmapItem {
    title: string
    description: string
    timeframe: string
}

// ─── Data ────────────────────────────────────────────────────────────────────

export const HERO_COUNTERS: HeroCounter[] = [
    { value: 10, label: 'δήμοι' },
    { value: 500, suffix: '+', label: 'θέματα' },
    { value: 200, suffix: '+', label: 'ώρες συνεδριάσεων' },
]

export const OPENNESS_FEATURES: Feature[] = [
    {
        id: 'subjects',
        title: 'Θέματα & Περιλήψεις',
        description: 'Κάθε συνεδρίαση χωρίζεται αυτόματα σε θέματα. Για κάθε θέμα, σύνοψη τοποθέτησης ανά ομιλητή, με βίντεο, κείμενο και ψηφοφορία.',
        status: 'live',
        demoUrl: '/chania/mar26_2026/subjects/cmmywhibg07ud139hav10soag',
    },
    {
        id: 'search',
        title: 'Αναζήτηση',
        description: 'Αναζήτηση σε όλα όσα έχουν ειπωθεί σε κάθε συνεδρίαση, σε κάθε δήμο.',
        status: 'live',
        demoUrl: '/search',
        screenshot: '/about/search-placeholder.png',
    },
    {
        id: 'notifications',
        title: 'Ειδοποιήσεις',
        description: 'Οι δημότες λαμβάνουν σύντομα μηνύματα σε SMS, WhatsApp και email, όποτε το ΔΣ συζητάει κάτι για τον δρόμο ή την γειτονιά τους.',
        status: 'live',
        demoUrl: '/athens/notifications',
        demoLabel: 'Εγγραφείτε στις ειδοποιήσεις για την Αθήνα',
        screenshot: '/about/notifications-placeholder.png',
    },
    {
        id: 'map',
        title: 'Χάρτης θεμάτων',
        description: 'Ζουμ σε κάθε περιοχή, γειτονιά και δρόμο: τα θέματα που συζητάει το ΔΣ και οι κοινότητες σε χάρτη.',
        status: 'live',
        demoUrl: '/map',
        demoLabel: 'Δείτε τον χάρτη',
    },
]

export const INTERNAL_FEATURES: Feature[] = [
    {
        id: 'transcription',
        title: 'Απομαγνητοφωνήσεις σε 48 ώρες',
        description: 'Ακριβείς, ελεγμένες από άνθρωπο απομαγνητοφωνήσεις κάθε συνεδρίασης, έτοιμες μέσα σε 48 ώρες. Αυτόματη αναγνώριση ομιλητή.',
        status: 'live',
        demoUrl: '/chania/mar26_2026/transcript',
        icon: Mic2,
    },
    {
        id: 'minutes',
        title: 'Αυτόματη παραγωγή πρακτικών',
        description: 'Αυτόματα πρακτικά της συνεδρίασης, έτοιμα για έλεγχο και υπογραφή. Εξοικονόμηση ημερών εργασίας.',
        status: 'live',
        icon: ScrollText,
    },
    {
        id: 'diavgeia',
        title: 'Αποφάσεις για τη Διαύγεια',
        description: 'Αυτόματη δημιουργία εγγράφων αποφάσεων, έτοιμων για ανάρτηση στη Διαύγεια.',
        status: 'upcoming',
        targetDate: 'Δεκέμβριος 2026',
        icon: Scale,
    },
    {
        id: 'print-archive',
        title: 'Παράδοση αρχείου σε έντυπη μορφή',
        description: 'Παράδοση αρχείου απομαγνητοφωνήσεων σε έντυπη μορφή, σύμφωνα με τις προδιαγραφές του κάθε δήμου.',
        status: 'live',
        icon: Printer,
    },
]

export const CUSTOMER_QUOTES: CustomerQuote[] = [
    {
        id: 'quote-chania',
        quote: 'Μέσα στα πρώτα πέντε λεπτά κατάλαβα πως ήταν κάτι το διαφορετικό.',
        name: 'Προϊσταμένη Δ/νσης Προγραμματισμού, Οργάνωσης και Πληροφορικής',
        role: 'Δήμος Χανίων',
    },
]

export const RECOGNITION_ITEMS: RecognitionItem[] = [
    {
        id: 'ministry-award',
        title: 'Βραβείο Υπουργείου Ψηφιακής Διακυβέρνησης',
        subtitle: 'Καλύτερη Εφαρμοσμένη Ιδέα — Τοπική Αυτοδιοίκηση',
        linkUrl: '',
    },
    {
        id: 'oecd',
        title: 'OECD',
        subtitle: 'Αναφορά σε έκθεση του ΟΟΣΑ για AI & Civic Engagement',
        linkUrl: 'https://oecd.ai/en/gov/issues/civic-engagement-open-government',
        logoUrl: '/about/oecd.png',
    },
    {
        id: 'ert',
        title: 'ERTnews',
        subtitle: 'Ρεπορτάζ για την τεχνητή νοημοσύνη στα Χανιά',
        linkUrl: 'https://www.ertnews.gr/video/xania-i-texniti-noimosyni-sti-diathesi-tou-dimoti/',
        logoUrl: '/about/ert-news.svg',
    },
    {
        id: 'kede',
        title: 'ΚΕΔΕ',
        subtitle: 'Άρθρο στο kede.gr για την τεχνητή νοημοσύνη στην τοπική δημοκρατία',
        linkUrl: 'https://kede.gr/opencouncil-chania-gr-i-protoporiaki-platforma-ai-pou-allazei-ta-dedomena-sto-dimotiko-symvoulio-chanion/',
        logoUrl: '/about/kede.png',
    },
]

export const TEAM_MEMBERS: TeamMember[] = [
    {
        name: 'Χρήστος Πορίος',
        image: '/people/christos.jpg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/christos-porios-91297690/',
            twitter: 'https://twitter.com/christosporios',
            email: 'mailto:christos@schemalabs.gr',
        },
    },
    {
        name: 'Ανδρέας Κούλουμος',
        image: '/people/andreas.jpg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/kouloumos/',
            twitter: 'https://twitter.com/kouloumos',
            email: 'mailto:andreas@schemalabs.gr',
        },
    },
    {
        name: 'Ελίζα Γκιμιτζούδη',
        image: '/people/eliza.jpeg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/egkimitzoudi/',
            email: 'mailto:eliza@schemalabs.gr',
        },
    },
    {
        name: 'Θάνος Παπαδογιάννης',
        image: '/people/thanos.png',
        socials: {
            linkedin: 'https://www.linkedin.com/in/athanasios-papadogiannis-099537195/',
            email: 'mailto:thanos@schemalabs.gr',
        },
    },
    {
        name: 'Βασιλική Κουμαρέλα',
        image: '/people/vasia.jpg',
        socials: {
            linkedin: 'https://www.linkedin.com/in/vasiliki-koumarela/',
        },
    },
    {
        name: 'Κλέα Μέσι',
        image: '/people/klea.png',
        socials: {
            linkedin: 'https://www.linkedin.com/in/klea-meshi-0980b2370/',
        },
    },
]

export const ROADMAP_ITEMS: RoadmapItem[] = [
    {
        title: 'Αυτόματες αποφάσεις Διαύγειας',
        description: 'Αυτόματη δημιουργία εγγράφων αποφάσεων για ανάρτηση στη Διαύγεια',
        timeframe: 'Q2 2026',
    },
    {
        title: 'Αμφίδρομες ειδοποιήσεις',
        description: 'Οι δημότες απαντάνε στις ειδοποιήσεις και στέλνουν feedback',
        timeframe: 'Q3 2026',
    },
    {
        title: 'Fine-tuned μοντέλο απομαγνητοφώνησης',
        description: 'Εξειδικευμένο μοντέλο για ελληνικά δημοτικά συμβούλια',
        timeframe: 'Q3 2026',
    },
]
