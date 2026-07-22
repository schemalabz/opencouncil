'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Map as MapIcon, Landmark, HelpCircle, MoreHorizontal, LogIn, LogOut, User, Phone, Mail, ArrowRight } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Image from 'next/image';
import type { LandingView } from '@/lib/landing/landingCore';
import { FOOTER_GROUPS, isInternalHref, reopenCookiePreferences } from './navLinks';
import { NotifyMunicipalityDialog, openAfterMenuCloses } from './NotifyMunicipalityDialog';
import type { LandingListCity } from '@/lib/landing/landingData';

/* The desktop landing's left nav rail: brand at the top, the three view items centered,
   and a Policy popover + Account control at the bottom. Selecting an item opens the
   adjacent list panel (owned by DesktopLayout). */
export function LandingAside({
    view,
    onSelect,
    infoOpen,
    onToggleInfo,
    cities,
}: {
    view: LandingView;
    onSelect: (v: LandingView) => void;
    /** the "?" info drawer is open — highlights the "?" item and de-highlights the view tabs */
    infoOpen: boolean;
    onToggleInfo: () => void;
    /** cooperating δήμοι, for the "which δήμος?" notifications dialog opened from "Περισσότερα" */
    cities: LandingListCity[];
}) {
    const t = useTranslations('landingV2');
    const [notifyOpen, setNotifyOpen] = useState(false);
    const { data: session, status } = useSession();
    // Auth UI depends on the client session, which differs server vs. first client render
    // (unseeded SessionProvider) → React #418. Gate on a mounted flag so both render null first.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    return (
        // Inner nav-rail column of the unified aside card (DesktopLayout owns the card chrome).
        <>
        <NotifyMunicipalityDialog open={notifyOpen} onOpenChange={setNotifyOpen} cities={cities} />
        <div className="flex w-[80px] shrink-0 flex-col items-center bg-card pb-3 pt-1">
            {/* brand */}
            <Link href="/" className="shrink-0 hover:opacity-90" aria-label="OpenCouncil">
                <Image src="/logo.png" alt="" width={72} height={72} className="h-11 w-auto object-contain" priority />
            </Link>

            {/* primary nav — centered */}
            <nav className="flex flex-1 flex-col items-center justify-center gap-2">
                {/* "Αρχική" (home) omitted on desktop for iteration 1 — returns in iteration 2. */}
                <RailItem
                    active={!infoOpen && view === 'subjects'}
                    onClick={() => onSelect('subjects')}
                    icon={<MapIcon className="h-5 w-5" />}
                    label={t('nav.subjects')}
                />
                <RailItem
                    active={!infoOpen && view === 'municipalities'}
                    onClick={() => onSelect('municipalities')}
                    icon={<Landmark className="h-5 w-5" />}
                    label={t('nav.municipalities')}
                />
                {/* the "?" guide — icon only, with a circular black selected state (distinct from
                    the rounded-square tabs above). Carries the orange accent at rest rather than
                    sitting greyed out: it read as decoration before and went unclicked. */}
                <button
                    type="button"
                    onClick={onToggleInfo}
                    aria-pressed={infoOpen}
                    aria-label={t('nav.info')}
                    className="flex h-16 w-16 items-center justify-center"
                >
                    {/* inner circle hugs the icon, so the selected black fill has little padding */}
                    <span
                        className={cn(
                            'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
                            infoOpen
                                ? 'bg-foreground text-background'
                                : 'bg-[hsl(var(--orange))]/10 text-[hsl(var(--orange))] hover:bg-[hsl(var(--orange))]/20',
                        )}
                    >
                        <HelpCircle className="h-7 w-7" />
                    </span>
                </button>
            </nav>

            {/* bottom: policy popover + account */}
            <div className="flex shrink-0 flex-col items-center gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label={t('nav.more')}
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <MoreHorizontal className="h-5 w-5" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        side="right"
                        align="end"
                        className="w-60 rounded-2xl border-border bg-card p-2 text-muted-foreground"
                    >
                        {/* brand header */}
                        <div className="flex items-center gap-2 px-2 pb-1.5 pt-1">
                            <Image src="/logo.png" alt="" width={40} height={40} className="h-8 w-auto object-contain" />
                            <span className="text-[18px] font-bold text-foreground">OpenCouncil</span>
                        </div>
                        <DropdownMenuSeparator className="bg-muted" />
                        {FOOTER_GROUPS.map((group, gi) => (
                            <div key={group.title}>
                                {gi > 0 && <DropdownMenuSeparator className="bg-muted" />}
                                <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {t(group.titleKey!)}
                                </DropdownMenuLabel>
                                {group.links.map((link) =>
                                    link.icon ? (
                                        // contact rows: leading icon, not hoverable
                                        <a
                                            key={link.label}
                                            href={link.href!}
                                            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground no-underline"
                                        >
                                            {link.icon === 'phone' ? <Phone className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                                            {link.label}
                                        </a>
                                    ) : link.cookie ? (
                                        <DropdownMenuItem
                                            key={link.label}
                                            onSelect={reopenCookiePreferences}
                                            className="rounded-lg text-muted-foreground focus:bg-muted focus:text-foreground"
                                        >
                                            {t(link.labelKey!)}
                                        </DropdownMenuItem>
                                    ) : link.notify ? (
                                        <DropdownMenuItem
                                            key={link.label}
                                            onSelect={() => openAfterMenuCloses(() => setNotifyOpen(true))}
                                            className="rounded-lg text-muted-foreground focus:bg-muted focus:text-foreground"
                                        >
                                            {t(link.labelKey!)}
                                        </DropdownMenuItem>
                                    ) : link.featured ? (
                                        // CTA: accent fill + arrow, stands out from the rest
                                        <DropdownMenuItem
                                            key={link.label}
                                            asChild
                                            className="rounded-lg bg-[hsl(var(--orange))]/15 font-semibold text-[hsl(var(--orange))] focus:bg-[hsl(var(--orange))]/25 focus:text-[hsl(var(--orange))]"
                                        >
                                            <Link href={link.href!} className="flex items-center justify-between gap-2">
                                                {t(link.labelKey!)}
                                                <ArrowRight className="h-4 w-4" />
                                            </Link>
                                        </DropdownMenuItem>
                                    ) : isInternalHref(link.href!) ? (
                                        <DropdownMenuItem
                                            key={link.label}
                                            asChild
                                            className="rounded-lg text-muted-foreground focus:bg-muted focus:text-foreground"
                                        >
                                            <Link href={link.href!}>{t(link.labelKey!)}</Link>
                                        </DropdownMenuItem>
                                    ) : (
                                        <DropdownMenuItem
                                            key={link.label}
                                            asChild
                                            className="rounded-lg text-muted-foreground focus:bg-muted focus:text-foreground"
                                        >
                                            <a
                                                href={link.href!}
                                                {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                            >
                                                {t(link.labelKey!)}
                                            </a>
                                        </DropdownMenuItem>
                                    ),
                                )}
                            </div>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {!mounted || status === 'loading' ? null : session?.user ? (
                    <>
                        <Link
                            href="/profile"
                            aria-label={t('account.profile')}
                            className="flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground hover:no-underline"
                        >
                            <User className="h-5 w-5" />
                            <span className="text-[12px] font-medium leading-none">{t('account.profile')}</span>
                        </Link>
                        <button
                            type="button"
                            onClick={() => signOut()}
                            aria-label={t('account.signOut')}
                            className="flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <LogOut className="h-5 w-5" />
                            <span className="text-[12px] font-medium leading-none">{t('account.logout')}</span>
                        </button>
                    </>
                ) : (
                    <Link
                        href="/sign-in"
                        aria-label={t('account.signInAria')}
                        className="flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl text-[hsl(var(--orange))] no-underline transition-colors hover:bg-muted hover:no-underline"
                    >
                        <LogIn className="h-5 w-5" />
                        <span className="text-[12px] font-medium leading-none">{t('account.signIn')}</span>
                    </Link>
                )}
            </div>
        </div>
        </>
    );
}

function RailItem({
    active,
    onClick,
    icon,
    label,
}: {
    active: boolean;
    onClick: () => void;
    icon: ReactNode;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                'flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium transition-colors',
                active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
        >
            {icon}
            <span className="break-all text-[14px] leading-none">{label}</span>
        </button>
    );
}
