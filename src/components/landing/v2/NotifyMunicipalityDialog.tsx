'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { LandingListCity } from '@/lib/landing/landingData';
import { CityAvatar } from './controls';
import { captureLandingAction } from '@/lib/landing/analytics';

/**
 * Opens the dialog once the menu that launched it has finished closing.
 *
 * Both entry points sit inside a Radix modal layer — the mobile nav Sheet, the desktop dropdown —
 * and each of those puts `pointer-events: none` on <body> for as long as it is open. Opening the
 * dialog in the same tick means two layers add and remove that lock while overlapping, and it can be
 * left behind on <body> after the dialog closes: the page then renders normally but ignores every
 * click. Waiting for the closing layer to unmount keeps the locks strictly sequential.
 */
export function openAfterMenuCloses(open: () => void): void {
    // longer than the menus' exit animation (duration-200), so the old layer is gone first
    setTimeout(open, 260);
}

/**
 * "Which δήμος do you care about?" — the notifications entry point offered from the menus on both
 * viewports.
 *
 * Signing up used to require already being on a municipality's page, which is the wrong way round
 * for the visitor this is aimed at: someone who has just arrived and wants updates but has no reason
 * to have navigated anywhere yet. Picking the δήμος *is* the first step, so the dialog leads with it
 * and hands off to that δήμος's notification page.
 */
export function NotifyMunicipalityDialog({
    open,
    onOpenChange,
    cities,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    cities: LandingListCity[];
}) {
    const t = useTranslations('landingV2');
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                align="start"
                className="flex max-h-[80dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg [&>button]:z-20"
                // the title already states what the dialog is for; a description would only repeat it
                // to screen readers. Opt out of the Radix a11y warning, as the nav drawer does.
                aria-describedby={undefined}
            >
                {/* fixed at the top of the column; pr-12 leaves the corner clear for the built-in close */}
                <DialogHeader className="shrink-0 border-b border-[#fc550a]/15 bg-[#fff4ee] py-3 pl-4 pr-12">
                    <DialogTitle className="text-left sm:!text-2xl !text-lg font-bold leading-snug text-foreground">
                        {t('notify.pickMunicipality')}
                    </DialogTitle>
                </DialogHeader>
                <div className="grid min-h-0 w-full grid-cols-3 gap-2 overflow-y-auto bg-gradient-to-br from-[#fc550a]/10 to-[#a4c0e1]/10 p-4">
                    {cities.map((city) => (
                        <Link
                            key={city.id}
                            href={`/${city.id}/notifications`}
                            onClick={() => {
                                captureLandingAction('notify_cta', { surface: 'notify_dialog', city_id: city.id });
                                onOpenChange(false);
                            }}
                            className="flex flex-col items-center gap-1.5 rounded-xl bg-white p-2.5 text-center no-underline shadow-sm transition-transform hover:scale-[1.03] hover:no-underline"
                        >
                            <CityAvatar city={city} />
                            {/* the genitive form ("Δήμος Αθηναίων"), as everywhere else a δήμος is named */}
                            <span className="text-md sm:text-lg font-semibold leading-tight text-foreground">
                                {city.name_municipality}
                            </span>
                        </Link>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
