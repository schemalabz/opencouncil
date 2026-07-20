'use client';

import { type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Menu, Home, ChevronDown, User, Bell, LogOut, LogIn, Search, Phone, Mail, ArrowRight } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetTitle } from '@/components/ui/sheet';
import { FOOTER_GROUPS, isInternalHref, reopenCookiePreferences, type FooterLink } from './navLinks';

/* Mobile top bar — a pill with the burger nav-drawer trigger + logo on the left and a separate
   bordered keyword-search box on the right. Tapping search opens the search overlay (owned by the
   layout). */
export function MobileHeader({
    onOpenSearch,
    searchActive,
    query,
}: {
    onOpenSearch: () => void;
    /** a keyword search is active — the search box goes orange and shows the query */
    searchActive?: boolean;
    /** the active search text, shown (truncated) inside the search box while searchActive */
    query?: string;
}) {
    const t = useTranslations('landingV2');
    const { data: session, status } = useSession();
    return (
        <div className="absolute inset-x-3 top-3 z-[9] flex items-center gap-1.5">
            {/* header pill: burger + logo + brand (both the burger/logo open the nav drawer). While a
                search is active it shrinks to fit its content, giving the width to the search box. */}
            <div
                className={cn(
                    'flex h-11 min-w-0 items-center gap-1.5 rounded-2xl border border-black/40 bg-card pl-1 pr-3 shadow-sm',
                    // active search splits the bar ~70/30 with the search box; otherwise fill the width.
                    searchActive ? 'flex-[7]' : 'flex-1',
                )}
            >
            {/* burger + logo — grouped and both open the nav drawer, no box */}
            <Sheet>
                <SheetTrigger asChild>
                    <button
                        type="button"
                        aria-label={t('nav.menu')}
                        className="flex shrink-0 items-center gap-0.5 rounded-xl px-1 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <Menu className="h-3.5 w-3.5 shrink-0" />
                        <Image src="/logo.png" alt="" width={120} height={120} className="h-9 w-9 shrink-0 object-contain" priority />
                    </button>
                </SheetTrigger>
                <SheetContent
                    side="left"
                    overlayClassName="bg-black/40 pointer-events-auto"
                    className="flex w-[300px] flex-col border-border bg-card p-0 text-foreground"
                    // nav drawer needs no description; opt out of the Radix a11y warning
                    aria-describedby={undefined}
                >
                    {/* Accessible name for the dialog (Radix requires a title). */}
                    <SheetTitle className="sr-only">{t('nav.menuTitle')}</SheetTitle>
                    {/* brand */}
                    <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-5 py-4">
                        <Image src="/logo.png" alt="" width={96} height={96} className="h-8 w-auto object-contain" priority />
                        <span className="text-lg font-bold tracking-tight text-foreground">OpenCouncil</span>
                    </div>

                    {/* primary nav + expandable link groups */}
                    <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
                        <DrawerLink href="/" icon={<Home className="h-[18px] w-[18px]" />}>{t('nav.home')}</DrawerLink>
                        {FOOTER_GROUPS.map((group) => (
                            <details key={group.title} className="group">
                                <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
                                    {t(group.titleKey!)}
                                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="flex flex-col gap-0.5 py-0.5 pl-3">
                                    {group.links.map((link) => (
                                        <DrawerFooterLink key={link.label} link={link} />
                                    ))}
                                </div>
                            </details>
                        ))}
                    </nav>

                    {/* account */}
                    <div className={cn('shrink-0 p-2', session?.user && 'border-t border-border')}>
                        {status === 'loading' ? null : session?.user ? (
                            <>
                                <div className="flex items-center gap-3 px-3 py-2">
                                    {session.user.image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={session.user.image} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                                    ) : (
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                                            <User className="h-5 w-5" />
                                        </span>
                                    )}
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">{session.user.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
                                    </div>
                                </div>
                                <DrawerLink href="/profile" icon={<User className="h-[18px] w-[18px]" />}>{t('account.profile')}</DrawerLink>
                                <DrawerLink href="/profile?tab=notifications" icon={<Bell className="h-[18px] w-[18px]" />}>
                                    {t('account.notifications')}
                                </DrawerLink>
                                <SheetClose asChild>
                                    <button
                                        type="button"
                                        onClick={() => signOut()}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-400 transition-colors hover:bg-red-500/15"
                                    >
                                        <LogOut className="h-[18px] w-[18px]" /> {t('account.signOut')}
                                    </button>
                                </SheetClose>
                            </>
                        ) : (
                            <SheetClose asChild>
                                <Link
                                    href="/sign-in"
                                    className="flex items-center justify-center gap-2 rounded-xl border-2 border-[hsl(var(--orange))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--orange))] no-underline transition-colors hover:bg-[hsl(var(--orange))]/10 hover:no-underline"
                                >
                                    <LogIn className="h-[18px] w-[18px]" /> {t('account.signIn')}
                                </Link>
                            </SheetClose>
                        )}
                    </div>

                    <div
                        className={cn(
                            'shrink-0 px-5 py-2.5 text-[11px] text-muted-foreground',
                            session?.user && 'border-t border-border',
                        )}
                    >
                        © {new Date().getFullYear()} OpenCouncil
                    </div>
                </SheetContent>
            </Sheet>

            <span className="truncate text-lg font-bold tracking-tight text-foreground">OpenCouncil</span>
            </div>

            {/* keyword search — a SEPARATE bordered box beside the header pill; turns orange with a
                dot once a search is active */}
            <button
                type="button"
                aria-label={t('common.search')}
                onClick={onOpenSearch}
                className={cn(
                    'flex h-11 items-center rounded-2xl border bg-card shadow-sm transition-colors',
                    searchActive
                        ? 'min-w-0 flex-[3] justify-start gap-2 px-3 border-[hsl(var(--orange))] bg-[hsl(24,100%,96%)] text-[hsl(var(--orange))]'
                        : 'w-11 shrink-0 justify-center border-black/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
            >
                <Search className="h-5 w-5 shrink-0" />
                {searchActive && query && (
                    <span className="min-w-0 truncate text-sm font-medium">{query}</span>
                )}
            </button>
        </div>
    );
}

function DrawerLink({ href, icon, children }: { href: string; icon?: ReactNode; children: ReactNode }) {
    return (
        <SheetClose asChild>
            <Link
                href={href}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground hover:no-underline"
            >
                {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
                {children}
            </Link>
        </SheetClose>
    );
}

/* an expandable-group link row (internal Link / external-mailto-tel anchor / cookie button),
   closes the drawer on tap */
function DrawerFooterLink({ link }: { link: FooterLink }) {
    const t = useTranslations('landingV2');
    const cls =
        'rounded-lg px-3 py-2 text-sm text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground hover:no-underline';
    if (link.icon) {
        // contact rows: leading icon, not hoverable
        return (
            <a href={link.href!} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground no-underline">
                {link.icon === 'phone' ? <Phone className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                {link.label}
            </a>
        );
    }
    if (link.cookie) {
        return (
            <SheetClose asChild>
                <button type="button" onClick={reopenCookiePreferences} className={cn('text-left', cls)}>
                    {t(link.labelKey!)}
                </button>
            </SheetClose>
        );
    }
    if (link.featured) {
        // CTA: accent fill + arrow, mirrors the desktop "Περισσότερα" popover
        return (
            <SheetClose asChild>
                <Link
                    href={link.href!}
                    className="flex items-center justify-between gap-2 rounded-lg bg-[hsl(var(--orange))]/15 px-3 py-2 text-sm font-semibold text-[hsl(var(--orange))] no-underline transition-colors hover:bg-[hsl(var(--orange))]/25 hover:no-underline"
                >
                    {t(link.labelKey!)}
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </SheetClose>
        );
    }
    if (isInternalHref(link.href!)) {
        return (
            <SheetClose asChild>
                <Link href={link.href!} className={cls}>
                    {t(link.labelKey!)}
                </Link>
            </SheetClose>
        );
    }
    return (
        <SheetClose asChild>
            <a
                href={link.href!}
                {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className={cls}
            >
                {t(link.labelKey!)}
            </a>
        </SheetClose>
    );
}
