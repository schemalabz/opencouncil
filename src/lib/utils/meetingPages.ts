import { LayoutDashboard, FileText, Mic, Map, Star, Settings, Bolt, type LucideIcon } from 'lucide-react';

/**
 * Meeting-page navigation segments with translated titles. Pass a translator
 * scoped to the `CouncilMeeting` namespace (e.g. `useTranslations('CouncilMeeting')`).
 */
export function getMeetingPageSegments(
    t: (key: string) => string,
): Record<string, { icon: LucideIcon; title: string }> {
    return {
        overview:   { icon: LayoutDashboard, title: t('pages.overview') },
        map:        { icon: Map,             title: t('pages.map') },
        transcript: { icon: Mic,             title: t('pages.transcript') },
        highlights: { icon: Star,            title: t('pages.highlights') },
        settings:   { icon: Settings,        title: t('pages.settings') },
        admin:      { icon: Bolt,            title: t('pages.admin') },
        subjects:   { icon: FileText,        title: t('pages.subjects') },
    };
}
