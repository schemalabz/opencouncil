"use client"

import { useTranslations } from 'next-intl';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

export type PanelTab = 'subjects' | 'cities';

/** Peek shows the grabber + count/tab row; half keeps the map visible. */
export const MOBILE_SNAP_POINTS: (string | number)[] = ['132px', 0.5, 0.92];

interface MapPanelProps {
    isDesktop: boolean;
    activeTab: PanelTab;
    onTabChange: (tab: PanelTab) => void;
    /** Which tabs exist on this surface (meeting maps show subjects only). */
    availableTabs?: PanelTab[];
    /** Compact summary line shown in the header row (count). */
    summary: React.ReactNode;
    children: React.ReactNode;
    /** Mobile drawer snap state (vaul). */
    snap: number | string | null;
    onSnapChange: (snap: number | string | null) => void;
}

function TabBar({ activeTab, onTabChange, availableTabs }: Pick<MapPanelProps, 'activeTab' | 'onTabChange'> & { availableTabs: PanelTab[] }) {
    const t = useTranslations('map');
    const tabs: { id: PanelTab; label: string }[] = [
        { id: 'subjects', label: t('tabSubjects') },
        { id: 'cities', label: t('tabCities') },
    ].filter(tab => availableTabs.includes(tab.id as PanelTab)) as { id: PanelTab; label: string }[];
    return (
        <div role="tablist" className="flex shrink-0 gap-1">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                        'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                        activeTab === tab.id
                            ? 'border-foreground text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

/**
 * The synced subjects/municipalities panel: a docked right column on
 * desktop, a non-modal bottom drawer with snap points on mobile (the map
 * stays interactive behind it).
 */
export function MapPanel({ isDesktop, activeTab, onTabChange, availableTabs = ['subjects', 'cities'], summary, children, snap, onSnapChange }: MapPanelProps) {
    const t = useTranslations('map');

    if (isDesktop) {
        return (
            <aside
                id="map-panel"
                aria-label={t('tabSubjects')}
                className="hidden h-full w-[400px] shrink-0 flex-col border-l border-border bg-background md:flex xl:w-[420px] 2xl:w-[440px]"
            >
                {/* The count lives in the tab content's own header — no duplicate here. */}
                <div className="flex items-center border-b border-border">
                    <TabBar activeTab={activeTab} onTabChange={onTabChange} availableTabs={availableTabs} />
                </div>
                {children}
            </aside>
        );
    }

    return (
        <Drawer
            open
            modal={false}
            dismissible={false}
            snapPoints={MOBILE_SNAP_POINTS}
            activeSnapPoint={snap}
            setActiveSnapPoint={onSnapChange}
            shouldScaleBackground={false}
        >
            <DrawerContent hideOverlay className="h-full max-h-[94%] outline-none" id="map-panel" aria-describedby={undefined}>
                <DrawerTitle className="sr-only">{t('tabSubjects')}</DrawerTitle>
                <div
                    className="flex items-center justify-between px-4 pb-1 pt-2"
                    onClick={() => {
                        if (snap === MOBILE_SNAP_POINTS[0]) onSnapChange(MOBILE_SNAP_POINTS[1]);
                    }}
                >
                    <div className="text-sm text-foreground">{summary}</div>
                    <TabBar activeTab={activeTab} onTabChange={onTabChange} availableTabs={availableTabs} />
                </div>
                <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            </DrawerContent>
        </Drawer>
    );
}
