'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { ArrowRight, AudioLines, BookOpen, Flame, Landmark, Map as MapIcon, PawPrint, Recycle, Search, Type } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { captureLandingAction } from '@/lib/landing/analytics';
import { subjectPath, type GeneralSubjectRow, type LandingListCity } from '@/lib/landing/landingData';
import { topicStyle } from '@/lib/topicStyle';

// How long a δήμος / subject stays in a door before the next one comes in.
const TICK_MS = 2600;

/**
 * The "?" drawer: what OpenCouncil does, in one sentence and one picture, and four doors out of it.
 *
 * The map's legend used to live here; it explained the pins to a reader who did not yet know what
 * the pins were *of*. This says the thing first — AI listens to council meetings and makes them
 * simple — shows how, and then sends the reader somewhere real: the map, a δήμος, a much-discussed
 * subject, or the long-form explainer.
 */
export function InfoPanel({
    cities,
    subjects,
    explainAvailable,
    onExploreMap,
}: {
    /** the covered municipalities — the "see a δήμος" door rotates through them */
    cities: LandingListCity[];
    /** the realm's most-discussed subjects lately (HOT_SUBJECTS_MONTHS / HOT_SUBJECTS_LIMIT) — the
     *  "see a subject" door rotates through them */
    subjects: GeneralSubjectRow[];
    /** whether this realm has an /explain page; otherwise "learn more" opens on how OpenCouncil works */
    explainAvailable: boolean;
    /** closes the drawer, leaving the subjects map in view */
    onExploreMap: () => void;
}) {
    const t = useTranslations('landingV2');

    // A random order, drawn once per open. The drawer never renders on the server (`infoOpen`
    // starts false and flips in an effect), so the shuffle cannot disagree with a server render.
    const cityLoop = useMemo(() => shuffle(cities.filter((c) => c._count.councilMeetings > 0)), [cities]);
    const subjectLoop = useMemo(() => shuffle(subjects), [subjects]);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-muted/40 px-4 py-4">
            {/* a <p>, not a heading: the global h2 rule centres and resizes headings */}
            <p className="shrink-0 text-balance text-[16px] font-semibold leading-snug text-foreground">
                {t.rich('info.heading', { em: (chunks) => <em>{chunks}</em> })}
            </p>

            <HowItWorks />

            <div className="mt-1 flex shrink-0 flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('info.startHere')}</span>

                {/* the primary door: the map is right there, behind the drawer */}
                <button
                    type="button"
                    onClick={() => {
                        captureLandingAction('info_cta_clicked', { target: 'map' });
                        onExploreMap();
                    }}
                    className={cn(
                        'group flex items-center gap-3 rounded-xl bg-[hsl(var(--orange))] px-3.5 py-3 text-left text-white shadow-md transition-colors duration-150 hover:bg-[hsl(var(--orange))]/90',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2',
                    )}
                >
                    <DoorIcon className="bg-white/15 text-white group-hover:bg-white/25 group-hover:text-white">
                        <MapIcon className="h-[18px] w-[18px]" />
                    </DoorIcon>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-semibold">{t('info.cta.map')}</span>
                        <span className="text-[13px] leading-snug">{t('info.cta.mapSub')}</span>
                    </span>
                    <DoorArrow className="text-white/80 group-hover:text-white" />
                </button>

                {/* the other three doors: one list, not three cards */}
                <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    {cityLoop.length > 0 && (
                        <TickerDoor
                            icon={<Landmark className="h-[18px] w-[18px]" />}
                            title={t('info.cta.city')}
                            items={cityLoop}
                            keyOf={(c) => c.id}
                            hrefOf={(c) => `/${c.id}`}
                            nameOf={(c) => c.name}
                            onPick={(c) => captureLandingAction('info_cta_clicked', { target: 'city', city_id: c.id })}
                            render={(c) => (
                                <>
                                    <CityLogo src={c.logoImage} />
                                    <span className="truncate">
                                        {c.name}
                                        <span className="text-muted-foreground/70">
                                            {' · '}
                                            {t('info.cta.cityMeetings', { count: c._count.councilMeetings })}
                                        </span>
                                    </span>
                                </>
                            )}
                        />
                    )}

                    {subjectLoop.length > 0 && (
                        <TickerDoor
                            icon={<Flame className="h-[18px] w-[18px]" />}
                            title={t('info.cta.subject')}
                            items={subjectLoop}
                            keyOf={(s) => s.id}
                            hrefOf={(s) => subjectPath(s.cityId, s.councilMeetingId, s.id)}
                            nameOf={(s) => `${s.name} (${s.cityName})`}
                            onPick={(s) => captureLandingAction('info_cta_clicked', { target: 'subject', subject_id: s.id })}
                            // half a beat behind the δήμος door, so the two never change together
                            offsetMs={TICK_MS / 2}
                            render={(s) => (
                                <>
                                    <CityLogo src={s.logoImage} />
                                    <span className="truncate">{s.name}</span>
                                </>
                            )}
                        />
                    )}

                    {/* /explain is about Greek local government and exists on the Greek realm only;
                        elsewhere the door opens on how OpenCouncil itself works. */}
                    <Link
                        href={explainAvailable ? '/explain' : '/about#how-it-works'}
                        onClick={() =>
                            explainAvailable
                                ? captureLandingAction('info_explain_clicked', {})
                                : captureLandingAction('info_cta_clicked', { target: 'about' })
                        }
                        className={rowClass}
                    >
                        <DoorIcon>
                            <BookOpen className="h-[18px] w-[18px]" />
                        </DoorIcon>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-sm font-semibold text-foreground">{t('info.cta.more')}</span>
                            <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
                                {explainAvailable ? t('info.cta.moreExplain') : t('info.cta.moreAbout')}
                            </span>
                        </span>
                        <DoorArrow />
                    </Link>
                </div>
            </div>
        </div>
    );
}

/* ================================ how it works ================================ */

// The two sample topics, in the Greek realm's own colours and icons for "Καθαριότητα &
// Απορρίμματα" and "Ζώα & Αδέσποτα" (a snapshot: topics are per-realm data, not shipped code).
const TOPICS = [
    { color: '#795548', Icon: Recycle },
    { color: '#4f46e5', Icon: PawPrint },
] as const;
// The two speakers: ink, and a deeper Marble Blue. The waveform and the transcript share them, so
// "who said what" reads without a word.
const SPEAKERS = ['hsl(var(--foreground) / 0.78)', 'hsl(212 46% 56%)'] as const;

// One pass of the loop, in ms: the meeting plays (the playhead crosses the waveform) while its
// words are written down, speaker by speaker; then the subjects are drawn out of the transcript;
// it holds, rewinds, and starts again.
const LOOP_MS = 9800;
const AUDIO = [400, 4400] as const;
const LINES = [
    [500, 2500],
    [2750, 4300],
] as const;
const CHIPS = [4700, 5200] as const;
const REWIND = [8600, 9200] as const;

// A speech-like waveform: fixed (the same on every render), with short silences between words and
// a longer one where the second speaker takes over.
const WAVE: number[] = Array.from({ length: 48 }, (_, i) => {
    if (i === 26 || i === 27) return 0.1;
    const envelope = Math.sin(i * 0.9) * 0.5 + 0.5;
    const jitter = ((i * 37) % 23) / 23;
    const silence = i % 7 === 6 ? 0.28 : 1;
    return Math.max(0.12, (0.28 + 0.72 * (0.6 * envelope + 0.4 * jitter)) * silence);
});
const SPEAKER_SPLIT = 27; // bars before this belong to the first speaker

type Frame = { words: [number, number]; chips: number; listening: boolean };

/** What is on screen at `t` ms into the loop. */
function frameAt(t: number, counts: [number, number]): Frame {
    const rewound = t >= REWIND[0];
    const reveal = ([from, to]: readonly [number, number], n: number) =>
        rewound ? 0 : Math.min(n, Math.max(0, Math.ceil(((t - from) / (to - from)) * n)));
    return {
        words: [reveal(LINES[0], counts[0]), reveal(LINES[1], counts[1])],
        chips: rewound ? 0 : t >= CHIPS[1] ? 2 : t >= CHIPS[0] ? 1 : 0,
        listening: !rewound && t >= AUDIO[0] && t <= AUDIO[1],
    };
}

/** How far the meeting has played at `t` (0..1): it plays, holds, then rewinds. */
function progressAt(t: number): number {
    if (t < AUDIO[0]) return 0;
    if (t <= AUDIO[1]) return (t - AUDIO[0]) / (AUDIO[1] - AUDIO[0]);
    if (t < REWIND[0]) return 1;
    if (t < REWIND[1]) return 1 - (t - REWIND[0]) / (REWIND[1] - REWIND[0]);
    return 0;
}

/* A transcript line's words. `[…]` marks the phrase a subject is drawn from (ICU leaves square
   brackets alone); punctuation after the closing bracket is kept out of the phrase. */
type Word = { text: string; mark: boolean; tail: string };
function parseLine(line: string): Word[] {
    let open = false;
    return line
        .split(/\s+/)
        .filter(Boolean)
        .map((raw) => {
            const opens = raw.includes('[');
            const closes = raw.includes(']');
            const mark = open || opens;
            if (opens) open = true;
            if (closes) open = false;
            const [body, tail = ''] = raw.replace('[', '').split(']');
            return { text: body, mark, tail };
        });
}

/**
 * How it works, as one loop: the meeting is heard (a waveform, coloured by speaker as the playhead
 * crosses it), written down word by word under each speaker's colour, and turned into subjects —
 * each one lighting up the words it came from. Nothing appears out of nowhere: unheard words are
 * word-shaped placeholders and unmade subjects are dashed slots, so the card is always whole.
 *
 * One JS clock drives it (requestAnimationFrame): the playhead and the fill ride a `--p` CSS
 * variable written straight to the DOM, and React re-renders only when a word, a subject or a
 * step changes. Under reduced motion there is no clock at all — the finished frame stands still.
 */
function HowItWorks() {
    const t = useTranslations('landingV2');
    const still = useReducedMotion() === true;
    const lines = useMemo(() => [parseLine(t('info.how.text1')), parseLine(t('info.how.text2'))], [t]);
    const counts: [number, number] = [lines[0].length, lines[1].length];
    const finished: Frame = { words: counts, chips: 2, listening: false };

    const [frame, setFrame] = useState<Frame>(() => frameAt(0, counts));
    const waveRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (still) return;
        let raf = 0;
        let last = performance.now();
        let elapsed = 0;
        let shown = '';
        const tick = (now: number) => {
            // a hidden tab pauses the clock rather than jumping ahead on return
            elapsed = (elapsed + Math.min(now - last, 100)) % LOOP_MS;
            last = now;
            const p = progressAt(elapsed);
            const wave = waveRef.current;
            if (wave) {
                wave.style.setProperty('--p', p.toFixed(4));
                wave.style.setProperty('--ph', p > 0 && elapsed <= AUDIO[1] ? '1' : '0');
            }
            const next = frameAt(elapsed, counts);
            const key = `${next.words[0]}|${next.words[1]}|${next.chips}|${next.listening}`;
            if (key !== shown) {
                shown = key;
                setFrame(next);
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
        // counts derive from the copy; a new copy restarts the loop
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [still, counts[0], counts[1]]);

    const f = still ? finished : frame;
    const writing = (f.words[0] > 0 && f.words[0] < counts[0]) || (f.words[1] > 0 && f.words[1] < counts[1]);

    return (
        <ol className="flex shrink-0 flex-col rounded-xl border border-border bg-card p-3">
            <Step icon={<AudioLines className="h-3 w-3" />} label={t('info.how.listen')} active={f.listening}>
                <Wave ref={waveRef} still={still} />
            </Step>

            <Step icon={<Type className="h-3 w-3" />} label={t('info.how.write')} active={writing}>
                {/* the record's voice: Roboto, as `.transcript-text` loads it */}
                <div
                    className="flex flex-col gap-1 text-[12.5px] leading-[19px] text-foreground"
                    style={{ fontFamily: "var(--font-roboto), 'Roboto', sans-serif" }}
                    aria-hidden
                >
                    {lines.map((words, li) => (
                        <p key={li}>
                            <Speaker color={SPEAKERS[li]} name={t(li === 0 ? 'info.how.speaker1' : 'info.how.speaker2')} heard={f.words[li] > 0} />{' '}
                            <Said words={words} shown={f.words[li]} lit={f.chips > li} color={TOPICS[li].color} />
                        </p>
                    ))}
                </div>
            </Step>

            <Step icon={<Search className="h-3 w-3" />} label={t('info.how.sort')} active={f.chips > 0} last>
                <div className="flex flex-col items-start gap-1.5" aria-hidden>
                    {TOPICS.map(({ color, Icon }, i) => (
                        <SubjectChip
                            key={i}
                            made={f.chips > i}
                            color={color}
                            icon={<Icon className="h-2.5 w-2.5" />}
                            topic={t(i === 0 ? 'info.how.topic1' : 'info.how.topic2')}
                            title={t(i === 0 ? 'info.how.subject1' : 'info.how.subject2')}
                        />
                    ))}
                </div>
            </Step>
        </ol>
    );
}

/* A step: its node on the thread, its label, and the picture under it. The thread runs from each
   node down to the next one — never past the last. */
function Step({
    icon,
    label,
    active,
    last,
    children,
}: {
    icon: ReactNode;
    label: string;
    active: boolean;
    last?: boolean;
    children: ReactNode;
}) {
    return (
        <li className="grid grid-cols-[22px_1fr] gap-x-3">
            <div className="relative flex justify-center" aria-hidden>
                <span
                    className={cn(
                        'relative z-[1] flex h-[22px] w-[22px] items-center justify-center rounded-full transition-colors duration-300',
                        active ? 'bg-foreground text-background' : 'bg-muted text-foreground/70',
                    )}
                >
                    {icon}
                </span>
                {!last && <span className="absolute -bottom-px left-1/2 top-[26px] w-px -translate-x-1/2 bg-border" />}
            </div>
            <div className={cn('flex min-w-0 flex-col gap-1.5', !last && 'pb-4')}>
                <span className="text-[12.5px] font-semibold leading-[22px] text-foreground">{label}</span>
                {children}
            </div>
        </li>
    );
}

/* The meeting's audio: grey where it has not played yet, each speaker's colour where it has. */
function Wave({ ref, still }: { ref: Ref<HTMLDivElement>; still: boolean }) {
    const bars = (colored: boolean) =>
        WAVE.map((h, i) => (
            <span
                key={i}
                className="min-w-0 flex-1 rounded-full"
                style={{
                    height: `${Math.round(h * 100)}%`,
                    backgroundColor: colored ? SPEAKERS[i < SPEAKER_SPLIT ? 0 : 1] : 'hsl(var(--foreground) / 0.12)',
                }}
            />
        ));
    return (
        <div
            ref={ref}
            className="relative h-7"
            style={{ '--p': still ? 1 : 0, '--ph': 0 } as CSSProperties}
            aria-hidden
        >
            <div className="absolute inset-0 flex items-center gap-[2px]">{bars(false)}</div>
            <div
                className="absolute inset-0 flex items-center gap-[2px]"
                style={{ clipPath: 'inset(0 calc(100% - var(--p) * 100%) 0 0)' }}
            >
                {bars(true)}
            </div>
            <span
                className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-[hsl(var(--orange))]"
                style={{ left: 'calc(var(--p) * 100%)', opacity: 'var(--ph)' }}
            />
        </div>
    );
}

function Speaker({ color, name, heard }: { color: string; name: string; heard: boolean }) {
    return (
        <span className="whitespace-nowrap font-semibold">
            <span className="mr-1 inline-block h-[11px] w-[3px] translate-y-[1px] rounded-full" style={{ backgroundColor: color }} />
            <span className={cn('rounded-[3px] transition-colors duration-200', !heard && 'bg-foreground/[0.07] text-transparent')}>{name}</span>
        </span>
    );
}

/* A line's words: said (text) or not yet (a word-shaped placeholder), and — once its subject is
   made — the phrase the subject came from, lit in that topic's wash. */
function Said({ words, shown, lit, color }: { words: Word[]; shown: number; lit: boolean; color: string }) {
    const wash = topicStyle(color).background;
    const word = (w: Word, i: number) => {
        const said = i < shown;
        return (
            <span
                data-state={said ? 'said' : 'pending'}
                className={cn('rounded-[3px] transition-colors duration-200', !said && 'bg-foreground/[0.07] text-transparent')}
            >
                {w.text}
            </span>
        );
    };
    const out: ReactNode[] = [];
    for (let i = 0; i < words.length; i++) {
        if (i > 0) out.push(' ');
        if (!words[i].mark) {
            out.push(<Fragment key={i}>{word(words[i], i)}{words[i].tail}</Fragment>);
            continue;
        }
        // a marked phrase: consecutive marked words under one highlight
        const start = i;
        const phrase: ReactNode[] = [];
        for (; i < words.length && words[i].mark; i++) {
            if (i > start) phrase.push(' ');
            phrase.push(<Fragment key={i}>{word(words[i], i)}</Fragment>);
        }
        i--;
        out.push(
            <Fragment key={`m${start}`}>
                <span
                    className="rounded-[3px] transition-[background-color,box-shadow] duration-300"
                    style={lit ? { backgroundColor: wash, boxShadow: `0 0 0 2px ${wash}` } : undefined}
                >
                    {phrase}
                </span>
                <span className={cn(i >= shown && 'text-transparent')}>{words[i].tail}</span>
            </Fragment>,
        );
    }
    return <>{out}</>;
}

/* A subject as the map shows one: the topic pill (icon and name, in the topic's wash) and the
   title. Before it is made it is a dashed slot of the same size. */
function SubjectChip({ made, color, icon, topic, title }: { made: boolean; color: string; icon: ReactNode; topic: string; title: string }) {
    const s = topicStyle(color);
    return (
        <span
            data-state={made ? 'made' : 'pending'}
            className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2.5 text-[11px] transition-[border-color,background-color,transform] duration-300',
                made ? 'scale-100 border-border bg-card' : 'scale-[0.98] border-dashed border-foreground/20 bg-transparent',
            )}
        >
            <span className={cn('flex min-w-0 items-center gap-1.5 transition-opacity duration-300', !made && 'opacity-0')}>
                <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-bold"
                    style={{ backgroundColor: s.background, color: s.icon }}
                >
                    {icon}
                    {topic}
                </span>
                <span className="truncate font-semibold text-foreground">{title}</span>
            </span>
        </span>
    );
}

/* =================================== doors =================================== */

/* A door that rotates through real things — a δήμος, a subject — and opens on the one it is
   showing. It is a plain link to that item, so a modified click or "copy link" stays honest,
   and it holds still while the pointer or focus is on it, so what the reader saw is what they get. */
function TickerDoor<T>({
    icon,
    title,
    items,
    keyOf,
    hrefOf,
    nameOf,
    onPick,
    render,
    offsetMs = 0,
}: {
    icon: ReactNode;
    title: string;
    items: T[];
    keyOf: (item: T) => string;
    hrefOf: (item: T) => string;
    /** the shown item's name, for the link's accessible name (the rotating text is hidden from AT) */
    nameOf: (item: T) => string;
    onPick: (item: T) => void;
    render: (item: T) => ReactNode;
    /** delays the first tick, to keep neighbouring doors out of step */
    offsetMs?: number;
}) {
    const reduceMotion = useReducedMotion();
    const [held, setHeld] = useState(false);
    const [index, setIndex] = useState(0);
    useEffect(() => {
        if (items.length < 2 || held) return;
        const tick = () => setIndex((i) => (i + 1) % items.length);
        let interval: ReturnType<typeof setInterval> | undefined;
        const first = setTimeout(() => {
            tick();
            interval = setInterval(tick, TICK_MS);
        }, TICK_MS + offsetMs);
        return () => {
            clearTimeout(first);
            if (interval) clearInterval(interval);
        };
    }, [items.length, held, offsetMs]);
    const item = items[index % items.length];
    const hold = () => setHeld(true);
    const release = () => setHeld(false);

    return (
        <Link
            href={hrefOf(item)}
            aria-label={`${title}: ${nameOf(item)}`}
            onClick={() => onPick(item)}
            onMouseEnter={hold}
            onMouseLeave={release}
            onFocus={hold}
            onBlur={release}
            className={rowClass}
        >
            <DoorIcon>{icon}</DoorIcon>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">{title}</span>
                <span className="relative block h-[18px] overflow-hidden" aria-hidden>
                    {/* the old one leaves before the new one arrives, a few px each way: never two half-lines at once */}
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                            key={keyOf(item)}
                            className="flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground"
                            initial={reduceMotion ? { opacity: 0 } : { y: 6, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { y: -6, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {render(item)}
                        </motion.span>
                    </AnimatePresence>
                </span>
            </span>
            <DoorArrow />
        </Link>
    );
}

// A row of the doors list. The ring is inset: the list clips its rows' outsides.
const rowClass = cn(
    'group flex items-center gap-3 px-3.5 py-3 text-left no-underline transition-colors duration-150 hover:bg-muted/60 hover:no-underline active:bg-muted',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground',
);

function CityLogo({ src }: { src: string | null }) {
    return src ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-contain" />
        </span>
    ) : (
        <Landmark className="h-3.5 w-3.5 shrink-0" />
    );
}

function DoorIcon({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <span
            className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors duration-150 group-hover:bg-foreground group-hover:text-background',
                className,
            )}
        >
            {children}
        </span>
    );
}

function DoorArrow({ className }: { className?: string }) {
    return (
        <ArrowRight
            className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-foreground',
                className,
            )}
        />
    );
}

/** Fisher–Yates, on a copy. */
function shuffle<T>(items: T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
