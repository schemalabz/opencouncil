import { LayoutDashboard, FileText, Mic, Map, Star, Settings, Bolt, type LucideIcon } from 'lucide-react';

export const MEETING_PAGE_SEGMENTS: Record<string, { icon: LucideIcon; title: string }> = {
    overview:   { icon: LayoutDashboard, title: 'Σύνοψη' },
    map:        { icon: Map,             title: 'Χάρτης' },
    transcript: { icon: Mic,             title: 'Απομαγνητοφώνηση' },
    highlights: { icon: Star,            title: 'Στιγμιότυπα' },
    settings:   { icon: Settings,        title: 'Ρυθμίσεις' },
    admin:      { icon: Bolt,            title: 'Διαχείριση' },
    subjects:   { icon: FileText,        title: 'Θέματα' },
};
