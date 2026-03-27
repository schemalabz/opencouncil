import { Mic2, Search, Bell, Map, FileText, ScrollText, Scale, Printer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────────────────

export const CONTACT_PHONE = '+302111980212'
export const CONTACT_PHONE_DISPLAY = '+30 2111980212'

// ─── Types ───────────────────────────────────────────────────────────────────

export type FeatureStatus = 'live' | 'upcoming'

export interface Feature {
    id: string
    title: string
    description: string
    status: FeatureStatus
    demoUrl?: string
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
        demoUrl: '/athens/subjects',
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
        description: 'Σύντομα μηνύματα για τα θέματα της γειτονιάς σου, μέσω SMS, WhatsApp και email — πριν και μετά από κάθε συνεδρίαση.',
        status: 'live',
        demoUrl: '/chalandri/notifications',
        screenshot: '/about/notifications-placeholder.png',
    },
    {
        id: 'map',
        title: 'Χάρτης θεμάτων',
        description: 'Τα θέματα κάθε συνεδρίασης τοποθετημένα στον χάρτη. Δες τι συζητήθηκε για τη γειτονιά σου.',
        status: 'live',
        demoUrl: '/chania/map',
    },
]

export const INTERNAL_FEATURES: Feature[] = [
    {
        id: 'transcription',
        title: 'Απομαγνητοφωνήσεις σε 48 ώρες',
        description: 'Ακριβείς, ελεγμένες από άνθρωπο απομαγνητοφωνήσεις κάθε συνεδρίασης, έτοιμες μέσα σε 48 ώρες. Αυτόματη αναγνώριση ομιλητή.',
        status: 'live',
        demoUrl: '/chania/jun25_2025/transcript',
        icon: Mic2,
    },
    {
        id: 'minutes',
        title: 'Αυτόματη παραγωγή πρακτικών',
        description: 'Τα επίσημα πρακτικά της συνεδρίασης παράγονται αυτόματα, έτοιμα για έλεγχο και υπογραφή. Εξοικονόμηση ημερών εργασίας.',
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
        id: 'quote-1',
        quote: 'Το OpenCouncil άλλαξε τον τρόπο που λειτουργεί το δημοτικό μας συμβούλιο. Οι πολίτες πλέον παρακολουθούν και συμμετέχουν ενεργά.',
        name: '[Αιρετός/ή]',
        role: 'Δήμαρχος',
        municipality: '[Δήμος]',
    },
    {
        id: 'quote-2',
        quote: 'Εξοικονομούμε ημέρες εργασίας κάθε μήνα. Η απομαγνητοφώνηση που γινόταν σε εβδομάδες, τώρα είναι έτοιμη σε 48 ώρες.',
        name: '[Υπάλληλος]',
        role: 'Γραμματέας Δ.Σ.',
        municipality: '[Δήμος]',
    },
    {
        id: 'quote-3',
        quote: 'Επιτέλους μπορώ να μάθω τι συζητήθηκε για τη γειτονιά μου, χωρίς να παρακολουθήσω 4ωρες συνεδριάσεις.',
        name: '[Δημότης/ισσα]',
        role: 'Δημότης',
        municipality: '[Δήμος]',
    },
]

export const RECOGNITION_ITEMS: RecognitionItem[] = [
    {
        id: 'ert',
        title: 'ERTnews',
        subtitle: 'Ρεπορτάζ για την τεχνητή νοημοσύνη στα Χανιά',
        linkUrl: 'https://www.ertnews.gr/video/xania-i-texniti-noimosyni-sti-diathesi-tou-dimoti/',
    },
    {
        id: 'kede',
        title: 'ΚΕΔΕ',
        subtitle: 'Άρθρο στο kede.gr',
        linkUrl: 'https://www.kede.gr/opencouncil-chania-gr-i-texniti-noimosini-sti-ypiresia-tis-topikis-dimokratias/',
    },
    {
        id: 'mayor-chania',
        title: 'Δήμαρχος Χανίων',
        subtitle: 'Παρουσίαση του OpenCouncil',
        linkUrl: 'https://www.instagram.com/p/DJo18NyCT5D/',
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
        name: '[Μέλος ομάδας 5]',
        image: '/people/placeholder.jpg',
        socials: {},
    },
    {
        name: '[Μέλος ομάδας 6]',
        image: '/people/placeholder.jpg',
        socials: {},
    },
]

export const ROADMAP_ITEMS: RoadmapItem[] = [
    {
        title: 'Αυτόματες αποφάσεις Διαύγειας',
        description: 'Αυτόματη δημιουργία εγγράφων αποφάσεων για ανάρτηση στη Διαύγεια',
        timeframe: 'Q4 2026',
    },
    {
        title: 'Αμφίδρομες ειδοποιήσεις',
        description: 'Οι δημότες απαντάνε στις ειδοποιήσεις και στέλνουν feedback',
        timeframe: 'Q1 2027',
    },
    {
        title: 'Fine-tuned μοντέλο απομαγνητοφώνησης',
        description: 'Εξειδικευμένο μοντέλο για ελληνικά δημοτικά συμβούλια',
        timeframe: 'Q2 2027',
    },
]
