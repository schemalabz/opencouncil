'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Map as MapIcon, Landmark, HelpCircle, MoreHorizontal, LogIn, LogOut, User, Phone, Mail, ArrowRight, Search, Bot } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { Link, getPathname } from '@/i18n/routing';
import { openAfterMenuCloses } from '@/lib/utils/menus';
import { useAccountLinks } from '@/components/layout/account-links';
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
import type { InfoSurface, LandingView } from '@/lib/landing/landingCore';
import { footerGroups, isInternalHref, reopenCookiePreferences } from './navLinks';
import { NotifyMunicipalityDialog } from './NotifyMunicipalityDialog';
import ScriptSwitcher from '@/components/layout/ScriptSwitcher';
import { captureLandingAction } from '@/lib/landing/analytics';
import type { LandingListCity } from '@/lib/landing/landingData';
import type { Realm } from '@prisma/client';

/* The desktop landing's left nav rail: brand at the top, the three view items centered,
   and a Policy popover + Account control at the bottom. Selecting an item opens the
   adjacent list panel (owned by DesktopLayout). */
export function LandingAside({
    view,
    onSelect,
    infoOpen,
    onToggleInfo,
    infoHint,
    cities,
    realm,
}: {
    view: LandingView;
    onSelect: (v: LandingView) => void;
    /** the "?" info drawer is open — highlights the "?" item and de-highlights the view tabs */
    infoOpen: boolean;
    onToggleInfo: (surface?: InfoSurface) => void;
    /** show the one-time "Τι είναι αυτό;" hint: solid-fill the "?" and label it (see LandingV2) */
    infoHint: boolean;
    /** cooperating δήμοι, for the "which δήμος?" notifications dialog opened from "Περισσότερα" */
    cities: LandingListCity[];
    /** the request's realm, from the server — picks the contact number in the menu */
    realm: Realm;
}) {
    const t = useTranslations('landingV2');
    const tAccount = useTranslations('account');
    const accountLinks = useAccountLinks();
    const locale = useLocale();
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
                    sitting greyed out: it read as decoration before and went unclicked. While the
                    first-visit hint is on, the tint becomes a solid fill and a "Τι είναι αυτό;"
                    label appears below — in the rail's own flow, so it covers nothing. */}
                <button
                    type="button"
                    onClick={() => onToggleInfo('rail')}
                    aria-pressed={infoOpen}
                    // While the hint is showing, the visible "Τι είναι αυτό;" label is the button's
                    // name — an aria-label would override it and break speech activation (WCAG 2.5.3).
                    aria-label={infoHint ? undefined : t('nav.info')}
                    className={cn('flex w-16 flex-col items-center justify-center', infoHint ? 'gap-1 py-1' : 'h-16')}
                >
                    {/* inner circle hugs the icon, so the selected black fill has little padding */}
                    <span
                        className={cn(
                            'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
                            infoOpen
                                ? 'bg-foreground text-background'
                                : infoHint
                                  ? 'bg-[hsl(var(--orange))] text-white shadow-md'
                                  : 'bg-[hsl(var(--orange))]/10 text-[hsl(var(--orange))] hover:bg-[hsl(var(--orange))]/20',
                        )}
                    >
                        <HelpCircle className="h-7 w-7" />
                    </span>
                    {infoHint && (
                        <span className="text-center text-[12px] font-bold leading-tight text-[hsl(var(--orange))]">
                            {t('info.title')}
                        </span>
                    )}
                </button>
            </nav>

            {/* bottom: script toggle (serbian realm only) + policy popover + account */}
            <div className="flex shrink-0 flex-col items-center gap-2">
                {/* /search and /mcp exist in the "Περισσότερα" menu too, but a menu is where
                    links go to hide — these two are product surfaces, so they get their own
                    rows, in the sign-in link's shape but muted (orange stays the CTA). */}
                <RailLink href="/search" icon={<Search className="h-5 w-5" />} label={t('nav.searchPage')} target="search" />
                <RailLink href="/mcp" icon={<Bot className="h-5 w-5" />} label={t('nav.mcp')} ariaLabel="OpenCouncil MCP" target="mcp" />
                <ScriptSwitcher />
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
                            <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-auto object-contain" />
                            <span className="text-[18px] text-foreground">OpenCouncil</span>
                        </div>
                        <DropdownMenuSeparator className="bg-muted" />
                        {/* the "?" guide — parity with the mobile menu's info action */}
                        <DropdownMenuItem
                            onSelect={() => onToggleInfo('menu')}
                            className="flex items-center gap-2 rounded-lg text-muted-foreground focus:bg-muted focus:text-foreground"
                        >
                            <HelpCircle className="h-4 w-4" />
                            {t('info.title')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-muted" />
                        {footerGroups(realm).map((group, gi) => (
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
                                            onSelect={() => {
                                                captureLandingAction('notify_dialog_opened', { surface: 'menu' });
                                                openAfterMenuCloses(() => setNotifyOpen(true));
                                            }}
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
                        {/* profile menu: the rail item opens a small menu instead of navigating,
                            so the personal highlights page gets an entry point here too */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                {/* An anchor, not a button: a plain click opens the menu, while
                                    cmd-click, middle-click and "copy link" still reach /profile. */}
                                <a
                                    href={getPathname({ href: '/profile', locale })}
                                    // Radix opens the menu on pointerdown, and only
                                    // excludes ctrl. Close it again when a modified
                                    // click means "open this somewhere else".
                                    onPointerDown={(e) => {
                                        if (e.metaKey || e.shiftKey || e.altKey) e.preventDefault();
                                    }}
                                    onClick={(e) => {
                                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                                        e.preventDefault();
                                    }}
                                    aria-label={tAccount('profile')}
                                    className="flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground hover:no-underline"
                                >
                                    <User className="h-5 w-5" />
                                    <span className="text-[12px] font-medium leading-none">{tAccount('profile')}</span>
                                </a>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                side="right"
                                align="end"
                                className="w-56 rounded-2xl border-border bg-card p-2 text-muted-foreground"
                            >
                                {accountLinks.map(({ href, labelKey, icon: Icon }) => (
                                    <DropdownMenuItem
                                        key={href}
                                        asChild
                                        className="rounded-lg text-muted-foreground focus:bg-muted focus:text-foreground"
                                    >
                                        <Link href={href} className="flex items-center gap-2">
                                            <Icon className="h-4 w-4" />
                                            {tAccount(labelKey)}
                                        </Link>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
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

/* Bottom-group page link: icon over a small label, like the account items. The rail is
   56px of usable width, so the MCP row carries the short label and the full name as its
   accessible one. */
function RailLink({
    href,
    icon,
    label,
    ariaLabel,
    target,
}: {
    href: string;
    icon: ReactNode;
    label: string;
    /** overrides the visible label as the accessible name, for a label too wide for the rail */
    ariaLabel?: string;
    target: 'search' | 'mcp';
}) {
    return (
        <Link
            href={href}
            aria-label={ariaLabel}
            onClick={() => captureLandingAction('nav_link', { target, surface: 'rail' })}
            className="flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground hover:no-underline"
        >
            {icon}
            <span className="text-[12px] font-medium leading-none">{label}</span>
        </Link>
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
