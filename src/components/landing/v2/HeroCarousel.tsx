'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Play, ArrowRight, BookOpen } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import Marquee from '@/components/ui/marquee';
import { cn } from '@/lib/utils';
import { municipalityLogos, explainQA, timelineSegments, platformStats } from './mockData';
import { SignupDialog } from './SignupDialog';

/**
 * Hero carousel (issue #208). Three slides, framer-motion transitions, autoplay
 * with pause-on-hover, arrows + dots. Lighter background than the first draft.
 * A subtle "liquid" blob backdrop sits behind the slides (P2 request).
 */

const SLIDE_COUNT = 3;
const AUTOPLAY_MS = 8000;

// Each slide gets its own background color.
const SLIDE_BG = [
    'bg-gradient-to-br from-[#1b2a55] via-[#243169] to-[#3a2c6b]', // product — blue / indigo
    'bg-[#e8e7e0]', // logos — creme-gray opal (solid, light)
    'bg-gradient-to-br from-[#3a2552] via-[#512451] to-[#5e2440]', // explain — purple / magenta
];

export function HeroCarousel() {
    const [[index, dir], setState] = useState<[number, number]>([0, 0]);
    const [paused, setPaused] = useState(false);

    const paginate = useCallback(
        (delta: number) => setState(([i]) => [(i + delta + SLIDE_COUNT) % SLIDE_COUNT, delta]),
        [],
    );
    const goTo = useCallback((target: number) => setState(([i]) => [target, target > i ? 1 : -1]), []);

    useEffect(() => {
        if (paused) return;
        const t = setInterval(() => {
            // Don't advance (and tear down an open modal) while a dialog is open.
            if (typeof document !== 'undefined' && document.querySelector('[role="dialog"][data-state="open"]')) return;
            paginate(1);
        }, AUTOPLAY_MS);
        return () => clearInterval(t);
    }, [paused, paginate, index]);

    const slides = [<ProductSlide key="product" />, <LogosSlide key="logos" />, <ExplainSlide key="explain" />];

    return (
        <div
            className="relative isolate flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#161d38] text-white lg:col-span-7"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            role="region"
            aria-roledescription="carousel"
            aria-label="OpenCouncil"
        >
            <div className="relative z-10 flex-1 min-h-[660px] sm:min-h-[600px]">
                <AnimatePresence initial={false} custom={dir} mode="popLayout">
                    <motion.div
                        key={index}
                        custom={dir}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ x: { type: 'spring', stiffness: 300, damping: 32 }, opacity: { duration: 0.2 } }}
                        className={cn('absolute inset-0 overflow-hidden', SLIDE_BG[index])}
                    >
                        <LiquidBackdrop />
                        <div className="relative z-10 flex h-full flex-col p-8 sm:p-10">{slides[index]}</div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Controls */}
            <button
                type="button"
                aria-label="Προηγούμενο"
                onClick={() => paginate(-1)}
                className="absolute left-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
            >
                <ChevronLeft className="h-5 w-5" />
            </button>
            <button
                type="button"
                aria-label="Επόμενο"
                onClick={() => paginate(1)}
                className="absolute right-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
            >
                <ChevronRight className="h-5 w-5" />
            </button>

            <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2">
                {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
                    <button
                        key={i}
                        type="button"
                        aria-label={`Slide ${i + 1}`}
                        aria-current={i === index}
                        onClick={() => goTo(i)}
                        className={cn(
                            'h-2 rounded-full transition-all',
                            i === index ? 'w-6 bg-[hsl(var(--orange))]' : 'w-2 bg-border hover:bg-muted-foreground/50',
                        )}
                    />
                ))}
            </div>
        </div>
    );
}

const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
};

/** Soft animated "liquid" blobs behind the slides (P2). prefers-reduced-motion safe. */
function LiquidBackdrop() {
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden motion-reduce:hidden">
            <motion.div
                className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-[#fc550a]/40 blur-3xl"
                animate={{ x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.15, 1] }}
                transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                className="absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-[#3b82f6]/40 blur-3xl"
                animate={{ x: [0, -40, 0], y: [0, -25, 0], scale: [1, 1.2, 1] }}
                transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                className="absolute left-1/3 top-1/3 h-56 w-56 rounded-full bg-[#a855f7]/30 blur-3xl"
                animate={{ x: [0, 30, -20, 0], y: [0, -20, 20, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
            />
        </div>
    );
}

// --- Slide 1: product (medium-dark bg, full height: title → video → timeline) ---
function ProductSlide() {
    return (
        <div className="flex h-full flex-col gap-5">
            <div className="shrink-0 space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">
                    Δημόσια διαφάνεια, απλά
                </span>
                <h1 className="text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">
                    Δες τι συζήτησε το συμβούλιό σου,{' '}
                    <span className="text-[#ff7a33]">απλά.</span>
                </h1>
                <p className="max-w-lg text-base text-white/70 sm:text-lg">
                    Βρες σε δευτερόλεπτα τι ειπώθηκε για το θέμα που σε ενδιαφέρει — χωρίς να
                    παρακολουθήσεις ολόκληρη τη συνεδρίαση.
                </p>
                <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                    <SignupDialog>
                        <Button size="lg" className="rounded-full bg-[#fc550a] text-white hover:bg-[#fc550a]/90">
                            Εγγραφή για ειδοποιήσεις
                        </Button>
                    </SignupDialog>
                    <Button
                        asChild
                        size="lg"
                        variant="outline"
                        className="rounded-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    >
                        <Link href="/about">Πώς λειτουργεί</Link>
                    </Button>
                </div>
            </div>

            {/* Video grows to use the remaining height; timeline sits beneath it */}
            <VideoPlaceholder />
            <ColorfulTimelineMock />
        </div>
    );
}

function VideoPlaceholder() {
    return (
        <div className="relative mx-auto flex min-h-[160px] w-full max-w-sm flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            <div className="absolute left-3 top-3 rounded-full bg-white/15 px-2.5 py-1 text-xs text-white/90 backdrop-blur">
                Δημοτικό Συμβούλιο · 12 Μαΐου
            </div>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#fc550a] text-white shadow-lg">
                <Play className="h-6 w-6 translate-x-0.5 fill-current" />
            </span>
        </div>
    );
}

/**
 * Static illustration evoking the colorful topic timeline (not the real component).
 * A loose, hand-drawn arrow points at the wide orange segment with a caption.
 */
function ColorfulTimelineMock() {
    return (
        <div className="relative shrink-0 rounded-2xl bg-white px-4 pb-4 pt-12 shadow-xl">
            {/* Caption + loose arrow pointing to the target segment (~36% across) */}
            <span className="absolute right-4 top-2 text-sm font-medium text-[#fc550a] sm:text-base">
                Βρείτε το σημείο που θέλετε
            </span>
            <svg
                className="absolute left-[26%] top-6 h-8 w-28 text-[#fc550a]"
                viewBox="0 0 120 40"
                fill="none"
                aria-hidden
            >
                <path
                    d="M116 6 C 86 0, 52 6, 26 30"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                />
                <path d="M26 30 l 13 -1 M26 30 l 1 -13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>

            <div className="flex h-11 w-full gap-[3px] overflow-hidden rounded-xl">
                {timelineSegments.map((seg, i) => (
                    <div
                        key={i}
                        style={{ width: `${seg.width}%`, backgroundColor: seg.color }}
                        className={cn('h-full transition-transform', seg.isTarget && 'scale-y-110 ring-2 ring-white')}
                    />
                ))}
            </div>
        </div>
    );
}

// --- Slide 2: municipality logos ---
function LogosSlide() {
    return (
        <div className="flex h-full flex-col justify-center gap-8 text-[#2a2d33]">
            <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    Χτίζουμε διαφάνεια σε <span className="text-[#fc550a]">{platformStats.citiesCount}</span> δήμους
                </h2>
                <p className="text-[#5b5f66]">Δες αν ο δικός σου είναι ήδη εδώ.</p>
            </div>
            <div
                className="relative w-full overflow-hidden"
                style={{
                    maskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
                }}
            >
                <Marquee className="[--duration:32s] [--gap:1.5rem]" pauseOnHover repeat={4}>
                    {municipalityLogos.map((m) => (
                        <Link
                            key={m.id}
                            href={`/${m.id}`}
                            tabIndex={-1}
                            className="flex flex-shrink-0 flex-col items-center gap-2 no-underline transition-transform hover:scale-105"
                        >
                            {m.logoImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={m.logoImage} alt={m.shortName} className="h-16 w-16 object-contain" />
                            ) : (
                                <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-black/10 bg-black/5 text-lg font-bold text-[#2a2d33]">
                                    {m.shortName.slice(0, 2)}
                                </span>
                            )}
                            <span className="max-w-[88px] text-xs leading-tight text-[#5b5f66]">{m.shortName}</span>
                        </Link>
                    ))}
                </Marquee>
            </div>
        </div>
    );
}

// --- Slide 3: explain Q&A CTA ---
const QA_ACCENTS = ['#fc550a', '#3b82f6', '#a855f7'];

function ExplainSlide() {
    return (
        <div className="flex h-full flex-col justify-center gap-6">
            <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white">
                    <BookOpen className="h-5 w-5" />
                </span>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Δεν είσαι σίγουρος πώς λειτουργούν;</h2>
            </div>

            <ul className="space-y-3">
                {explainQA.map((item, i) => (
                    <li
                        key={i}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                        style={{ borderLeft: `3px solid ${QA_ACCENTS[i % QA_ACCENTS.length]}` }}
                    >
                        <p className="font-semibold text-white">{item.q}</p>
                        <p className="mt-0.5 text-sm text-white/70">{item.a}</p>
                    </li>
                ))}
            </ul>

            <div className="pt-1">
                <Button asChild size="lg" className="rounded-full bg-[#fc550a] text-white hover:bg-[#fc550a]/90">
                    <Link href="/explain">
                        Διαβάστε περισσότερα
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </div>
        </div>
    );
}
