"use client"
import { cn } from "@/lib/utils"
import { Link } from '@/i18n/routing'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import UserDropdown from "./user-dropdown"
import { motion, AnimatePresence } from 'framer-motion'
import { SidebarTrigger } from '../ui/sidebar'
import { City } from '@prisma/client'
import { Input } from "@/components/ui/input"
import { Search, Bot, Building2, ChevronRight, HelpCircle, type LucideIcon } from "lucide-react"
import { useRouter, useSelectedLayoutSegment } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { useSubjectHeaderOptional, SubjectHeaderInfo } from "@/contexts/SubjectHeaderContext"
import { AutoScrollText } from "@/components/ui/auto-scroll-text"
import { getMeetingPageSegments } from "@/lib/utils/meetingPages"
import { TopicIcon } from '@/components/TopicIcon';
import { headerControlClass } from './headerControl';

export interface PathElement {
    name: string
    link: string
    description?: string
    city?: City
}

interface HeaderProps {
    path: PathElement[]
    showSidebarTrigger?: boolean
    currentEntity?: { cityId: string }
    /**
     * What this page can do — rendered in the action bar below the header, not
     * beside the search box. See {@link Header}.
     */
    children?: React.ReactNode
    noContainer?: boolean
    className?: string
    /**
     * A persistent nav owns the left column of this page, so its edge is the
     * page's one vertical rule. The header sits beside it: no mark, no rule of
     * its own, and the path starts on that edge. Below `md` the nav is an
     * overlay with no edge, so the mark and the toggle come back to the header.
     */
    inset?: boolean
    /**
     * Whether to offer the /explain guide. Resolved by the server parent with
     * `hasExplainPage(await getRealm())` — the page 404s outside the Greek realm,
     * and this component is a client one, so it cannot read the realm itself.
     */
    showExplain?: boolean
}

/**
 * The app header: where you are, search, you — and nothing else, on every screen.
 *
 * The bar used to carry three unrelated classes of thing at identical weight:
 * orientation (two marks and a breadcrumb), app-wide utilities (search, MCP, the
 * guide, the script switch) and whatever the current page could do (edit,
 * highlight, present, share). On a meeting page that was eight controls and two
 * marks in one 390px row. Only the third class varies by page, so only it moves:
 * page actions arrive as `children` and render in the action bar below, and the
 * rarely-wanted utilities moved inside the account menu, which can name them.
 *
 * On a phone the action bar is not a new row — it is the second row the meeting
 * page already rendered (`sm:hidden`, sidebar toggle + page title), now shown at
 * every width and carrying the actions on its right.
 */
const Header = ({ path, showSidebarTrigger = false, currentEntity, children, noContainer = false, className, showExplain = false, inset = false }: HeaderProps) => {
    const t = useTranslations("Header");
    const tCommon = useTranslations("Common");
    const meetingPageSegments = getMeetingPageSegments(useTranslations("CouncilMeeting"));
    const [isScrolled, setIsScrolled] = useState(false);
    const [isContentScrolled, setIsContentScrolled] = useState(false);
    const router = useRouter();
    const segment = useSelectedLayoutSegment();
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchOverlayRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const subjectContext = useSubjectHeaderOptional();
    const subjectHeader = subjectContext?.subjectHeader ?? null;

    // The search modal is portaled to <body>: the header's containers set
    // their own position/z-index (e.g. the (other) layout downgrades it to
    // z-10), so a fixed overlay rendered inside would be trapped in that
    // stacking context and page content could paint above the backdrop.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const dynamicPath = [...path];
    // These breadcrumbs target the city-scoped signup pages, but the same
    // segment names also match routes without a city context (/notifications/[id],
    // /petition, /admin/notifications), where the link would be /undefined/...
    if (currentEntity?.cityId) {
        if (segment === 'notifications') {
            dynamicPath.push({
                name: t("notificationsBreadcrumb"),
                link: `/${currentEntity.cityId}/notifications`
            });
        } else if (segment === 'petition') {
            dynamicPath.push({
                name: t("petitionBreadcrumb"),
                link: `/${currentEntity.cityId}/petition`
            });
        }
    }

    if (showSidebarTrigger) {
        if (subjectHeader) {
            dynamicPath.push({ name: subjectHeader.name, link: '' });
        } else {
            // `/{cityId}/{meetingId}` is the overview and renders with no child
            // segment, so fall back to it exactly as `pageIcon` below does.
            // Without the fallback nothing is pushed, and the action bar ends up
            // holding the meeting name while the header holds the administrative
            // body. Only inside a meeting: the admin shell also sets
            // `showSidebarTrigger` and must not gain a page crumb of its own.
            const key = path[0]?.city ? (segment ?? 'overview') : segment;
            const pageConfig = key ? meetingPageSegments[key] : null;
            if (pageConfig) {
                dynamicPath.push({ name: pageConfig.title, link: '' });
            }
        }
    }

    const isMeetingContext = showSidebarTrigger && dynamicPath.length >= 2 && Boolean(path[0]?.city);
    const cityElement: PathElement | undefined = dynamicPath[0];
    const isCurrentSubject = subjectHeader !== null;
    const PageIcon = (showSidebarTrigger && !subjectHeader)
        ? meetingPageSegments[segment ?? 'overview']?.icon
        : null;

    // In a meeting the last crumb is the page (or the subject) and belongs to the
    // action bar; the meeting itself titles the header. Everywhere else the last
    // crumb titles the header and there is nothing below it.
    const titleElement = isMeetingContext
        ? dynamicPath[dynamicPath.length - 2]
        : dynamicPath[dynamicPath.length - 1];
    const trailElements = isMeetingContext
        ? dynamicPath.slice(0, -2)
        : dynamicPath.slice(0, -1);
    const pageElement = isMeetingContext ? dynamicPath[dynamicPath.length - 1] : null;

    // The bar exists when the page has something to say about itself: a meeting
    // page always does, and any caller passing actions does by definition.
    const hasActionBar = isMeetingContext || Boolean(children);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            const searchUrl = currentEntity?.cityId
                ? `/search?query=${encodeURIComponent(searchQuery.trim())}&cityId=${currentEntity.cityId}`
                : `/search?query=${encodeURIComponent(searchQuery.trim())}`;
            router.push(searchUrl);
            setSearchQuery("");
            setIsSearchOpen(false);
        }
    };

    // Lightweight scroll tracking — replaces framer-motion useScroll/useTransform
    // to avoid keeping the framer-motion frame loop alive on every page
    useEffect(() => {
        const onScroll = () => {
            const scrolled = window.scrollY > 50;
            setIsScrolled(prev => prev === scrolled ? prev : scrolled);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        if (!hasActionBar) return;
        // `data-scroll-container`, set by the meeting layout on its scroll pane.
        // This listener used to look for `data-meeting-scroll`, which nothing in
        // the app has ever set, so the collapse below never once fired.
        const scrollContainer = document.querySelector('[data-scroll-container]');
        if (!scrollContainer) return;

        const handleScroll = () => setIsContentScrolled(scrollContainer.scrollTop > 20);
        handleScroll();
        scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, [hasActionBar]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchOverlayRef.current && !searchOverlayRef.current.contains(event.target as Node)) {
                setIsSearchOpen(false);
            }
        };

        if (isSearchOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            searchInputRef.current?.focus();
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isSearchOpen]);

    // A meeting always carries its city on the first crumb. Without that test
    // `/admin/settings/...` qualified too: `settings` is both an admin segment and
    // a key in getMeetingPageSegments, so the segment crumb pushed the path to
    // length 2 and the admin shell inherited a meeting's header.
    const renderMarks = () => (
        <div className={cn('flex items-center gap-2 sm:gap-3', inset && 'md:hidden')}>
            {showSidebarTrigger && (
                <SidebarTrigger className="h-5 w-5 shrink-0 text-muted-foreground/60" />
            )}
            <Link href="/" className="flex shrink-0 items-center gap-2 hover:no-underline">
                <Image
                    src='/logo.png'
                    alt='OpenCouncil'
                    width={120}
                    height={120}
                    className="h-9 w-auto object-contain sm:h-10 md:h-11"
                />
                {dynamicPath.length === 0 && (
                    <span className="text-base sm:text-lg md:text-xl">OpenCouncil</span>
                )}
            </Link>
            {inset && renderSeal()}
        </div>
    );

    /** Row 1, column 2: where you are, down to the meeting. */
    const renderPath = () => (
        titleElement ? (
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                {!inset && renderSeal()}
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                        {trailElements.length > 0 && (
                            <div className="flex min-w-0 items-center gap-1">
                                {trailElements.map((element, index) => (
                                    <div key={element.link || `trail-${index}`} className="flex min-w-0 items-center gap-1">
                                        {index > 0 && (
                                            <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" aria-hidden />
                                        )}
                                        <Link
                                            href={element.link}
                                            className="truncate text-[11px] text-muted-foreground transition-colors hover:text-foreground sm:text-xs"
                                        >
                                            {element.name}
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        )}
                {titleElement.link ? (
                    <Link href={titleElement.link} className="truncate text-sm font-medium hover:no-underline sm:text-base">
                        {titleElement.name}
                    </Link>
                ) : (
                    <span className="truncate text-sm font-medium sm:text-base">{titleElement.name}</span>
                )}
                </div>
            </div>
        ) : null
    );

    /**
     * The municipality's seal, which sits with whatever else names the city.
     *
     * Beside a nav that is the nav's head, left of the rule with the app's mark —
     * from `md`, since below that the nav is an overlay with no head to sit in.
     * With no nav there is no head, so it goes right of the rule with the city's
     * name: the rule then separates OpenCouncil from the municipality rather than
     * cutting between the municipality's seal and its name.
     *
     * It is a lockup, not a mark — the Athens one is 492×200,
     * so at a height a phone bar can spare its wordmark cannot be read and it
     * still costs ~70px of width. Below `sm` the municipality is written instead.
     */
    const renderSeal = () => (
        cityElement?.city ? (
            <Link href={cityElement.link} className="hidden shrink-0 items-center sm:flex" aria-hidden tabIndex={-1}>
                {cityElement.city.logoImage ? (
                    <Image
                        src={cityElement.city.logoImage}
                        alt=""
                        width={120}
                        height={120}
                        className="h-8 w-auto max-w-[84px] object-contain md:h-10 md:max-w-[112px]"
                        priority
                    />
                ) : (
                    <Building2 className="h-8 w-8 text-muted-foreground/50 md:h-10 md:w-10" />
                )}
            </Link>
        ) : null
    );

    const renderControls = () => (
        <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
                onClick={() => setIsSearchOpen(true)}
                className={cn(headerControlClass, 'w-9 sm:w-auto sm:px-3')}
                aria-label={t('search')}
                title={t('search')}
            >
                <Search className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline text-sm">{t('search')}</span>
            </button>
            {/* From `lg` the bar has room to name these, so they come back out of
                the account menu — which hides them at the same width. Below it
                they would be two more unlabelled glyphs, which is what the
                redesign moved them out of. */}
            <Link
                href="/mcp"
                className={cn(headerControlClass, 'hidden px-3 lg:flex')}
                title={t('mcp')}
            >
                <Bot className="h-4 w-4 shrink-0" />
                <span className="text-sm">{t('mcpShort')}</span>
            </Link>
            {showExplain && (
                <Link
                    href="/explain"
                    className={cn(headerControlClass, 'hidden px-3 text-foreground ring-1 ring-border lg:flex')}
                    title={t('explain')}
                >
                    <HelpCircle className="h-4 w-4 shrink-0 text-[hsl(var(--orange))]" />
                    <span className="text-sm">{t('explainShort')}</span>
                </Link>
            )}
            <UserDropdown
                currentEntity={currentEntity}
                city={cityElement?.city}
                showExplain={showExplain}
            />
        </div>
    );

    /**
     * Row 2, column 1: the meeting's own controls, and which page you are on.
     *
     * The page badge sits here rather than beside its label so the label itself
     * starts on the column rule, directly under the meeting name it belongs to.
     */
    /**
     * The page's icon, set with its name rather than alone in a column.
     *
     * A filled badge in a column of its own read as a stray control with a gap
     * after it. At this size the glyph is a piece of the label's typography, so
     * it takes the label's weight and sits on its line.
     */
    const renderPageIcon = () => (
        isCurrentSubject && subjectHeader ? (
            <TopicIcon
                color={subjectHeader.topicColor}
                icon={subjectHeader.topicIcon}
                size="sm"
                className="h-[18px] w-[18px] shrink-0 p-0"
            />
        ) : PageIcon ? (
            <PageIcon className="h-[17px] w-[17px] shrink-0 text-muted-foreground/70" />
        ) : null
    );

    /* Scrolls when it does not fit rather than ending in an ellipsis: page and
       subject names are long in Greek, and the bar holds the actions at a fixed
       width, so the title is what gives. Same treatment for both — a truncated
       page name is no more readable than a truncated subject. */
    const renderPageLabel = () => (
        pageElement ? (
            <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground/80 sm:text-sm">
                {renderPageIcon()}
                <div className="min-w-0 flex-1">
                    {isCurrentSubject ? (
                        <AutoScrollText>
                            <span className="leading-tight">{pageElement.name}</span>
                        </AutoScrollText>
                    ) : (
                        <span className="block truncate">{pageElement.name}</span>
                    )}
                </div>
            </div>
        ) : null
    );

    /**
     * What this page can do — one toolbar, one owner.
     *
     * The four meeting buttons arrive as `children` and are always rendered:
     * ShareDropdown is a controlled surface the transcript opens through
     * ShareContext, so hiding it behind a condition would break "copy link at
     * this timestamp" rather than just hide a button.
     */
    const renderPageActions = () => (
        <div className="flex shrink-0 items-center gap-1">{children}</div>
    );

    // One grid, two rows, three columns: who we are / where you are / what you
    // can do. The columns are shared, so the page label starts at exactly the x
    // of the meeting name above it — the second row is the last step of the same
    // path, and read as an unrelated bar while the two were laid out separately.
    // The rule between column one and two runs the full height of both rows: one
    // line, not a hairline in each, which is what makes the rows read as one
    // block. Cells carry it rather than a wrapper so it disappears with the
    // identity row when that folds away on a phone.
    // Beside a persistent nav the page already has its one vertical rule — the
    // nav's edge — so the header draws none and its path starts on it.
    const rule = titleElement && !inset ? 'border-l border-border' : '';
    const pad = titleElement ? (inset ? 'pl-2.5 md:pl-0' : 'pl-2.5 sm:pl-4') : '';
    const rowOne = cn(
        // Folds away once the meeting's own pane scrolls, leaving the action
        // bar: deep in a transcript the useful row is the one holding the page
        // and its tools, not the one holding the logo. Phones only — a desktop
        // has the room, and hiding the account there is worse.
        hasActionBar && isContentScrolled
            ? 'h-0 overflow-hidden opacity-0 sm:h-20 sm:overflow-visible sm:opacity-100'
            : 'h-16 opacity-100 sm:h-20',
        'transition-all duration-300 ease-in-out',
    );
    const rowTwo = 'row-start-2 h-12 items-center sm:h-[54px]';

    const renderGrid = () => (
        <div className={cn(
            'grid grid-cols-[auto_minmax(0,1fr)_auto] px-2 sm:px-4',
            // Collapsed explicitly rather than left to `auto`: the mark's cell is
            // display:none from `md` when a nav owns the column, but an auto track
            // still reserved 28px, which pushed the path off the nav's edge.
            inset && 'md:grid-cols-[0px_minmax(0,1fr)_auto]',
        )}>
            <div className={cn('col-start-1 row-start-1 flex items-center', rowOne)}>{renderMarks()}</div>
            <div className={cn('col-start-2 row-start-1 flex min-w-0', rowOne, rule, pad)}>{renderPath()}</div>
            <div className={cn('col-start-3 row-start-1 ml-auto flex items-center', rowOne)}>{renderControls()}</div>

            {hasActionBar && (
                <>
                    {/* The band is its own item spanning every column, pulled out
                        past the grid's padding: carried on the cells it stopped
                        16px short of the nav's edge, so a white gap ran down
                        between the rule and the row it belongs to. The cells above
                        keep the padding, so only the fill bleeds. */}
                    <div className="col-start-1 col-span-3 row-start-2 -mx-2 border-t border-border/60 bg-muted/40 sm:-mx-4" />
                    {/* From column one: below `md` the marks column holds the mark
                        and the toggle, and indenting the page behind them left it
                        floating in the middle of a row it owns. From `md` that
                        column is zero wide, so this lands on the crumb's x anyway. */}
                    <div className={cn('col-start-1 col-span-2 flex min-w-0 items-center', rowTwo)}>{renderPageLabel()}</div>
                    <div className={cn('col-start-3 ml-auto flex', rowTwo)}>{renderPageActions()}</div>
                </>
            )}
        </div>
    );

    return (
        <motion.header
            className={cn(
                // `relative` last would delete `sticky`: cn is twMerge, and both
                // are position utilities. That is why the header was never
                // actually sticky. Callers that want it in flow (the meeting and
                // admin shells, which pin it with their own h-screen layout) still
                // win, because their className is merged after this one.
                "sticky top-0 z-50 w-full",
                className
            )}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <div
                className={cn(
                    "absolute inset-0 backdrop-blur bg-background/50 transition-opacity duration-200",
                    isScrolled ? "opacity-100" : "opacity-0"
                )}
            />
            <div className="relative">
                {noContainer ? renderGrid() : <div className="container mx-auto">{renderGrid()}</div>}
            </div>

            {/* Search Modal */}
            {mounted && createPortal(<AnimatePresence>
                {isSearchOpen && (
                    <div className="fixed inset-0 z-50">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                        />
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                            <motion.div
                                ref={searchOverlayRef}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="relative w-full max-w-2xl bg-background rounded-lg shadow-lg border"
                            >
                                <form onSubmit={handleSearch} className="relative p-3 sm:p-4">
                                    <Search className="absolute left-6 sm:left-7 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        ref={searchInputRef}
                                        type="text"
                                        placeholder={tCommon('searchPlaceholder')}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-8 sm:pl-9 h-10 sm:h-12 text-sm sm:text-base"
                                        aria-label={t('search')}
                                        autoFocus
                                    />
                                </form>
                            </motion.div>
                        </div>
                    </div>
                )}
            </AnimatePresence>, document.body)}
        </motion.header>
    )
}

export default Header
