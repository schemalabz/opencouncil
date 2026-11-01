'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, Landmark, MessageSquare, PanelsTopLeft, UserRound, Users } from 'lucide-react';
import { LANE_LABEL, TIMELINE_MOMENTS, type Lane, type MomentId } from '@/lib/explain/aiLiteracy';

/**
 * Σχ. 1: a meeting's path through OpenCouncil as a swimlane chart.
 *
 * Columns are the six phases of a meeting's life, in time order (not to
 * scale). Rows are who acts: the municipality; OpenCouncil, on an AI track
 * and a people track; and the citizens, who get messages and see the meeting
 * page. The page fills up from the bottom: each thing that appears on it is a
 * bar that starts when it appears and stays to the end, so reading a column
 * downwards shows what exists at that moment. Arrows show hand-offs: the
 * output of one piece becomes the input of the next.
 *
 * Selecting a phase lights its column and the caption below says what each
 * row does then. Dark hairline drawing, one accent colour only on what is
 * happening now. The phase buttons are the accessible control.
 */

const W = 880;
const H = 384;
/** Column edges, one column per phase. The gutter with the row names is to the left. */
const COL_EDGES = [150, 246, 346, 468, 606, 744, 870] as const;
const X_END = 862;
/** Track centres. */
const Y = { city: 60, ai: 120, human: 166, msg: 216, decisions: 248, summaries: 274, transcript: 300, video: 326, subjects: 352 } as const;
const BAR_H = 18;
const DOT_R = 4.5;
const AUTOPLAY_MS = 5000;

const MOMENT_INDEX = Object.fromEntries(TIMELINE_MOMENTS.map((m, i) => [m.id, i])) as Record<MomentId, number>;

type LabelAt = 'right' | 'left' | 'above' | 'aboveFrom' | 'below';

type Mark = { kind: 'bar'; x0: number; x1: number } | { kind: 'dots'; xs: number[]; labelAt: LabelAt };

interface Item {
    id: string;
    /** The phase it happens in. */
    from: MomentId;
    /** The last phase it is still "now" in; afterwards it reads as already there. */
    to?: MomentId;
    y: number;
    label: string;
    mark: Mark;
    /** Only in some municipalities or bodies: drawn dashed. */
    partial?: boolean;
    /** AI text that no person has checked: drawn hatched while live. */
    unchecked?: boolean;
}

const bar = (x0: number, x1: number): Mark => ({ kind: 'bar', x0, x1 });
const dots = (xs: number[], labelAt: LabelAt): Mark => ({ kind: 'dots', xs, labelAt });

const ITEMS: Item[] = [
    // the municipality
    { id: 'c-agenda', from: 'before', y: Y.city, label: 'Πρόσκληση', mark: dots([168], 'right') },
    { id: 'c-meeting', from: 'meeting', y: Y.city, label: 'Συνεδρίαση', mark: bar(252, 340) },
    { id: 'c-decisions', from: 'later', y: Y.city, label: 'Αποφάσεις', mark: dots([748, 760, 772], 'above') },
    { id: 'c-sign', from: 'later', y: Y.city, label: 'Υπογραφή', mark: bar(800, 866) },
    // OpenCouncil, AI track
    { id: 'a-subjects', from: 'before', y: Y.ai, label: 'Θέματα', mark: dots([168], 'aboveFrom') },
    { id: 'a-msg-before', from: 'before', y: Y.ai, label: 'Μήνυμα', mark: dots([212], 'right') },
    { id: 'a-transcribe', from: 'hours', y: Y.ai, label: 'Απομαγνητοφώνηση', mark: bar(350, 468) },
    { id: 'a-summaries', from: 'checked', y: Y.ai, label: 'Συνόψεις', mark: bar(604, 684) },
    { id: 'a-msg-after', from: 'checked', y: Y.ai, label: 'Μήνυμα', mark: dots([716], 'above') },
    { id: 'a-match', from: 'later', y: Y.ai, label: 'Αντιστοίχιση', mark: dots([748, 760, 772], 'aboveFrom') },
    // OpenCouncil, people track
    { id: 'h-approve-before', from: 'before', y: Y.human, label: 'Έγκριση', mark: dots([212], 'right'), partial: true },
    { id: 'h-record', from: 'meeting', y: Y.human, label: 'Καταγραφή', mark: bar(270, 340), partial: true },
    { id: 'h-review', from: 'review', y: Y.human, label: 'Έλεγχος από άνθρωπο', mark: bar(474, 600) },
    { id: 'h-approve-after', from: 'checked', y: Y.human, label: 'Έγκριση', mark: dots([716], 'left'), partial: true },
    { id: 'h-minutes', from: 'later', y: Y.human, label: 'Πρακτικά', mark: dots([846], 'below') },
    // citizens: messages
    { id: 'p-msg-before', from: 'before', y: Y.msg, label: 'Μήνυμα πριν', mark: dots([212], 'right') },
    { id: 'p-msg-after', from: 'checked', y: Y.msg, label: 'Μήνυμα μετά', mark: dots([716], 'left') },
    // citizens: the meeting page, which fills up from the bottom
    { id: 'p-decisions', from: 'later', y: Y.decisions, label: 'Αποφάσεις', mark: bar(744, X_END) },
    { id: 'p-summaries', from: 'checked', y: Y.summaries, label: 'Συνόψεις και τοποθετήσεις', mark: bar(616, X_END), unchecked: true },
    {
        id: 'p-unchecked',
        from: 'hours',
        to: 'review',
        y: Y.transcript,
        label: 'Απομαγνητοφώνηση χωρίς έλεγχο',
        mark: bar(350, 600),
        partial: true,
        unchecked: true,
    },
    { id: 'p-checked', from: 'checked', y: Y.transcript, label: 'Ελεγμένη απομαγνητοφώνηση', mark: bar(600, X_END) },
    { id: 'p-video', from: 'meeting', y: Y.video, label: 'Βίντεο', mark: bar(252, X_END) },
    { id: 'p-subjects', from: 'before', y: Y.subjects, label: 'Θέματα', mark: bar(168, X_END) },
];

/** A hand-off: an orthogonal polyline with an arrowhead at its end. */
interface Link {
    moment: MomentId;
    pts: readonly (readonly [number, number])[];
    partial?: boolean;
    /** Joins another link instead of ending on a mark. */
    noHead?: boolean;
}

const top = (y: number) => y - BAR_H / 2;
const bottom = (y: number) => y + BAR_H / 2;

const LINKS: Link[] = [
    // the agenda becomes subjects, a first message, and the first thing on the page
    { moment: 'before', pts: [[168, Y.city + DOT_R], [168, Y.ai - DOT_R]] },
    { moment: 'before', pts: [[168 + DOT_R, Y.ai], [212 - DOT_R, Y.ai]] },
    { moment: 'before', pts: [[212, Y.ai + DOT_R], [212, Y.human - DOT_R]], partial: true },
    { moment: 'before', pts: [[212, Y.human + DOT_R], [212, Y.msg - DOT_R]] },
    { moment: 'before', pts: [[168, Y.ai + DOT_R], [168, top(Y.subjects)]] },
    // the video: one line down from the meeting, branching to the transcription and ending on the page
    { moment: 'meeting', pts: [[340, Y.city], [344, Y.city], [344, top(Y.video)]] },
    { moment: 'hours', pts: [[344, Y.ai], [350, Y.ai]] },
    { moment: 'hours', pts: [[340, Y.human], [344, Y.human], [344, Y.ai]], partial: true, noHead: true },
    // the automatic transcript: shown unchecked in some bodies, and checked by a person
    { moment: 'hours', pts: [[404, bottom(Y.ai)], [404, top(Y.transcript)]], partial: true },
    { moment: 'review', pts: [[464, bottom(Y.ai)], [464, 143], [480, 143], [480, top(Y.human)]] },
    // the checked transcript feeds the summaries and replaces the unchecked one
    { moment: 'checked', pts: [[600, Y.human], [606, Y.human], [606, bottom(Y.ai)]] },
    { moment: 'checked', pts: [[606, Y.human], [606, top(Y.transcript)]] },
    { moment: 'checked', pts: [[630, bottom(Y.ai)], [630, top(Y.summaries)]] },
    { moment: 'checked', pts: [[716, Y.ai + DOT_R], [716, Y.human - DOT_R]], partial: true },
    { moment: 'checked', pts: [[716, Y.human + DOT_R], [716, Y.msg - DOT_R]] },
    // decisions are matched to subjects, and the minutes go back to the municipality to sign
    { moment: 'later', pts: [[748, Y.city + DOT_R], [748, Y.ai - DOT_R]] },
    { moment: 'later', pts: [[748, Y.ai + DOT_R], [748, top(Y.decisions)]] },
    { moment: 'later', pts: [[772, Y.ai + DOT_R], [772, Y.human], [846 - DOT_R, Y.human]] },
    { moment: 'later', pts: [[846, Y.human - DOT_R], [846, bottom(Y.city)]] },
];

type Status = 'future' | 'now' | 'past';

function itemStatus(item: Item, step: number): Status {
    const first = MOMENT_INDEX[item.from];
    const last = MOMENT_INDEX[item.to ?? item.from];
    if (step < first) return 'future';
    if (step > last) return 'past';
    return 'now';
}

function linkStatus(link: Link, step: number): Status {
    const i = MOMENT_INDEX[link.moment];
    if (step < i) return 'future';
    if (step > i) return 'past';
    return 'now';
}

function polyline(pts: Link['pts']): string {
    return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
}

function dotsLabelProps(xs: number[], y: number, at: LabelAt): { x: number; y: number; textAnchor: 'start' | 'middle' | 'end' } {
    const mid = (xs[0] + xs[xs.length - 1]) / 2;
    switch (at) {
        case 'right':
            return { x: xs[xs.length - 1] + DOT_R + 5, y: y + 4.5, textAnchor: 'start' };
        case 'left':
            return { x: xs[0] - DOT_R - 5, y: y + 4.5, textAnchor: 'end' };
        case 'above':
            return { x: mid, y: y - DOT_R - 6, textAnchor: 'middle' };
        case 'aboveFrom':
            return { x: xs[0] + 2, y: y - DOT_R - 6, textAnchor: 'start' };
        case 'below':
            return { x: mid, y: y + DOT_R + 15, textAnchor: 'middle' };
    }
}

function ItemMark({ item, status }: { item: Item; status: Status }) {
    const cls = `mk ${status}${item.partial ? ' partial' : ''}${item.unchecked ? ' unchecked' : ''}`;
    const { mark, y, label } = item;
    if (mark.kind === 'bar') {
        return (
            <g>
                <rect className={cls} x={mark.x0} y={top(y)} width={mark.x1 - mark.x0} height={BAR_H} rx={4} />
                <text className={`lb in ${status}`} x={mark.x0 + 7} y={y + 4}>
                    {label}
                </text>
            </g>
        );
    }
    return (
        <g>
            {mark.xs.map((x) => (
                <circle key={x} className={cls} cx={x} cy={y} r={DOT_R} />
            ))}
            <text className={`lb out ${status}`} {...dotsLabelProps(mark.xs, y, mark.labelAt)}>
                {label}
            </text>
        </g>
    );
}

/** A lucide icon drawn inside the chart's gutter. */
function GutterIcon({ x, y, size = 14, children }: { x: number; y: number; size?: number; children: ReactNode }) {
    return (
        <svg x={x} y={y - size / 2} width={size} height={size} viewBox="0 0 24 24">
            {children}
        </svg>
    );
}

const LANE_ICON: Record<Lane, ReactNode> = {
    municipality: <Landmark className="h-3.5 w-3.5" aria-hidden="true" />,
    opencouncil: (
        <span className="inline-flex gap-0.5" aria-hidden="true">
            <Bot className="h-3.5 w-3.5" />
            <UserRound className="h-3.5 w-3.5" />
        </span>
    ),
    citizens: <Users className="h-3.5 w-3.5" aria-hidden="true" />,
};

const LANES: Lane[] = ['municipality', 'opencouncil', 'citizens'];
const STATUSES: Status[] = ['future', 'now', 'past'];

export function MeetingTimelineFigure() {
    const [step, setStep] = useState(0);
    const [idle, setIdle] = useState(true);
    const [reduced, setReduced] = useState(false);
    const [pulseKey, setPulseKey] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const scrollerRef = useRef<HTMLDivElement>(null);
    const buttonsRef = useRef<HTMLOListElement>(null);

    const go = useCallback((i: number, byUser: boolean) => {
        const n = TIMELINE_MOMENTS.length;
        setStep(((i % n) + n) % n);
        setPulseKey((k) => k + 1);
        if (byUser) setIdle(false);
    }, []);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(mq.matches);
        const onChange = () => setReduced(mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    // Advance on its own until the reader touches it, and only while on screen.
    useEffect(() => {
        if (!idle || reduced) return;
        const el = rootRef.current;
        if (!el) return;
        let timer: number | undefined;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && timer === undefined) {
                    timer = window.setInterval(() => {
                        setStep((s) => (s + 1) % TIMELINE_MOMENTS.length);
                        setPulseKey((k) => k + 1);
                    }, AUTOPLAY_MS);
                } else if (!entry.isIntersecting && timer !== undefined) {
                    window.clearInterval(timer);
                    timer = undefined;
                }
            },
            { threshold: 0.4 },
        );
        io.observe(el);
        return () => {
            io.disconnect();
            if (timer !== undefined) window.clearInterval(timer);
        };
    }, [idle, reduced]);

    // On a narrow screen the chart and the buttons scroll sideways: keep the
    // lit column and its button in view. Only these rows scroll, never the page.
    useEffect(() => {
        const behavior = reduced ? 'auto' : 'smooth';
        const chart = scrollerRef.current;
        if (chart && chart.scrollWidth > chart.clientWidth) {
            const centre = (COL_EDGES[step] + COL_EDGES[step + 1]) / 2;
            chart.scrollTo({ left: (centre / W) * chart.scrollWidth - chart.clientWidth / 2, behavior });
        }
        const list = buttonsRef.current;
        const button = list?.children[step] as HTMLElement | undefined;
        if (list && button && list.scrollWidth > list.clientWidth) {
            list.scrollTo({ left: button.offsetLeft - list.clientWidth / 2 + button.offsetWidth / 2, behavior });
        }
    }, [step, reduced]);

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowRight') {
            go(step + 1, true);
            e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
            go(step - 1, true);
            e.preventDefault();
        }
    };

    const current = TIMELINE_MOMENTS[step];

    return (
        <div ref={rootRef} className="oc-tl not-prose mt-6 rounded-2xl bg-[#14110D] p-4 text-white sm:p-6" onKeyDown={onKey}>
            <style>{STYLE}</style>
            <div className="flex items-baseline justify-between gap-3 text-[11px] uppercase tracking-wider text-white/45">
                <span>Σχ. 1 · Η πορεία μιας συνεδρίασης</span>
                <span className="hidden sm:inline">πατήστε μια στήλη · ← →</span>
            </div>

            <div
                ref={scrollerRef}
                className="-mx-4 mt-3 overflow-x-auto px-4 sm:mx-0 sm:px-0"
                tabIndex={0}
                role="group"
                aria-label="Σχήμα: τι κάνει ο δήμος, το OpenCouncil και οι δημότες σε κάθε φάση μιας συνεδρίασης. Με τα βελάκια αλλάζει η φάση."
            >
                <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[720px]" aria-hidden="true" focusable="false">
                    <defs>
                        <filter id="oc-tl-glow" filterUnits="userSpaceOnUse" x="-20" y="-20" width={W + 40} height={H + 40}>
                            <feGaussianBlur stdDeviation="2.4" result="b" />
                            <feMerge>
                                <feMergeNode in="b" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        <pattern id="oc-tl-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                            <rect width="6" height="6" className="hatch-bg" />
                            <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" />
                        </pattern>
                        {STATUSES.map((s) => (
                            <marker
                                key={s}
                                id={`oc-tl-head-${s}`}
                                className={`head ${s}`}
                                viewBox="0 0 10 10"
                                refX="9"
                                refY="5"
                                markerWidth="7"
                                markerHeight="7"
                                orient="auto-start-reverse"
                            >
                                <path d="M1 1 L9 5 L1 9 Z" />
                            </marker>
                        ))}
                    </defs>

                    {/* the lit column: everything inside it happens at the same time */}
                    <rect
                        className="band"
                        x={COL_EDGES[step] + 2}
                        y={4}
                        width={COL_EDGES[step + 1] - COL_EDGES[step] - 4}
                        height={H - 8}
                        rx={8}
                    />

                    {/* column headers and separators */}
                    {TIMELINE_MOMENTS.map((m, i) => {
                        const cx = (COL_EDGES[i] + COL_EDGES[i + 1]) / 2;
                        const lit = i === step;
                        return (
                            <g key={m.id}>
                                <text className={`colnum${lit ? ' lit' : ''}`} x={cx} y={16} textAnchor="middle">
                                    {i + 1}
                                </text>
                                <text className={`colhead${lit ? ' lit' : ''}`} x={cx} y={31} textAnchor="middle">
                                    {m.label}
                                </text>
                            </g>
                        );
                    })}
                    {COL_EDGES.slice(1, -1).map((x) => (
                        <line key={x} className="grid" x1={x} y1={8} x2={x} y2={H - 8} />
                    ))}

                    {/* rows */}
                    <line className="split" x1={8} y1={92} x2={W - 8} y2={92} />
                    <line className="split" x1={8} y1={196} x2={W - 8} y2={196} />
                    <line className="subsplit" x1={COL_EDGES[0]} y1={143} x2={W - 8} y2={143} />
                    <line className="subsplit" x1={COL_EDGES[0]} y1={232} x2={W - 8} y2={232} />
                    <g className="gutter">
                        <GutterIcon x={14} y={Y.city}>
                            <Landmark />
                        </GutterIcon>
                        <text className="lane" x={34} y={Y.city + 4.5}>
                            {LANE_LABEL.municipality}
                        </text>

                        <text className="lane" x={14} y={108}>
                            {LANE_LABEL.opencouncil}
                        </text>
                        <GutterIcon x={14} y={Y.ai} size={13}>
                            <Bot />
                        </GutterIcon>
                        <text className="track" x={32} y={Y.ai + 4}>
                            τεχνητή νοημοσύνη
                        </text>
                        <GutterIcon x={14} y={Y.human} size={13}>
                            <UserRound />
                        </GutterIcon>
                        <text className="track" x={32} y={Y.human + 4}>
                            άνθρωποι
                        </text>

                        <GutterIcon x={14} y={Y.msg}>
                            <Users />
                        </GutterIcon>
                        <text className="lane" x={34} y={Y.msg + 4.5}>
                            {LANE_LABEL.citizens}
                        </text>
                        <GutterIcon x={14} y={Y.msg + 22} size={12}>
                            <MessageSquare />
                        </GutterIcon>
                        <text className="track" x={32} y={Y.msg + 26}>
                            μηνύματα
                        </text>
                        <GutterIcon x={14} y={Y.transcript} size={12}>
                            <PanelsTopLeft />
                        </GutterIcon>
                        <text className="track" x={32} y={Y.transcript + 4}>
                            σελίδα συνεδρίασης
                        </text>
                        <text className="hint" x={32} y={Y.transcript + 18}>
                            γεμίζει από κάτω
                        </text>
                    </g>

                    {/* hand-offs, then the pulses that run along the live ones */}
                    {LINKS.map((l, i) => {
                        const status = linkStatus(l, step);
                        return (
                            <path
                                key={i}
                                className={`link ${status}${l.partial ? ' partial' : ''}`}
                                d={polyline(l.pts)}
                                markerEnd={l.noHead ? undefined : `url(#oc-tl-head-${status})`}
                            />
                        );
                    })}
                    {!reduced &&
                        LINKS.map((l, i) =>
                            linkStatus(l, step) === 'now' ? (
                                <path key={`${pulseKey}-${i}`} className="pulse" d={polyline(l.pts)} pathLength={1000} />
                            ) : null,
                        )}

                    {ITEMS.map((item) => (
                        <ItemMark key={item.id} item={item} status={itemStatus(item, step)} />
                    ))}

                    {/* click targets, one per column */}
                    {TIMELINE_MOMENTS.map((m, i) => (
                        <rect
                            key={m.id}
                            className="hit"
                            x={COL_EDGES[i]}
                            y={0}
                            width={COL_EDGES[i + 1] - COL_EDGES[i]}
                            height={H}
                            onClick={() => go(i, true)}
                        />
                    ))}
                </svg>
            </div>

            {/* legend */}
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-white/55">
                <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-4 rounded-sm bg-orange" aria-hidden="true" />
                    γίνεται τώρα
                </li>
                <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-4 rounded-sm border border-white/35 bg-white/15" aria-hidden="true" />
                    υπάρχει ήδη
                </li>
                <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-4 rounded-sm border border-white/25" aria-hidden="true" />
                    ακολουθεί
                </li>
                <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-4 rounded-sm border border-dashed border-white/50" aria-hidden="true" />
                    μόνο σε κάποιους δήμους ή όργανα
                </li>
                <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-4 rounded-sm bg-[repeating-linear-gradient(45deg,hsl(var(--orange))_0_2px,transparent_2px_5px)]" aria-hidden="true" />
                    κείμενο από ΤΝ χωρίς έλεγχο
                </li>
                <li className="flex items-center gap-1.5">
                    <span className="text-white/70" aria-hidden="true">
                        →
                    </span>
                    το ένα τροφοδοτεί το άλλο
                </li>
                <li className="text-white/40">Οι στήλες ακολουθούν τη χρονική σειρά. Δεν είναι υπό κλίμακα.</li>
            </ul>

            {/* phase buttons: the real control */}
            <ol ref={buttonsRef} className="relative -mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Φάσεις">
                {TIMELINE_MOMENTS.map((m, i) => {
                    const active = i === step;
                    return (
                        <li key={m.id} className="shrink-0">
                            <button
                                type="button"
                                aria-pressed={active}
                                onClick={() => go(i, true)}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                                    active
                                        ? 'border-orange bg-orange/15 text-white'
                                        : 'border-white/15 text-white/60 hover:border-white/40 hover:text-white'
                                }`}
                            >
                                <span className={`font-mono ${active ? 'text-orange' : 'text-white/40'}`}>{i + 1}</span>
                                {m.label}
                            </button>
                        </li>
                    );
                })}
            </ol>

            {/* what each row does in the lit phase */}
            {/* announce changes only when the reader drives them, never during autoplay */}
            <div className="mt-4 border-t border-white/10 pt-4" aria-live={idle ? 'off' : 'polite'}>
                <p className="m-0 text-base font-semibold text-white">
                    {step + 1}. {current.label}
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    {LANES.map((lane) => {
                        const text = current.lanes[lane];
                        return (
                            <div key={lane}>
                                <p
                                    className={`m-0 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${
                                        text ? 'text-orange' : 'text-white/35'
                                    }`}
                                >
                                    {LANE_ICON[lane]}
                                    {LANE_LABEL[lane]}
                                </p>
                                <p className={`m-0 mt-1.5 text-sm leading-relaxed ${text ? 'text-white/80' : 'text-white/30'}`}>
                                    {text ?? '—'}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

const STYLE = `
.oc-tl{--panel:#14110D;--accent:hsl(var(--orange));--accent-hi:#ffb27a}
.oc-tl svg *{vector-effect:non-scaling-stroke}
.oc-tl .gutter svg *{vector-effect:none}
.oc-tl .band{fill:var(--accent);opacity:.09;transition:x .35s ease,width .35s ease}
.oc-tl .grid{stroke:rgba(255,255,255,.06);stroke-width:1}
.oc-tl .split{stroke:rgba(255,255,255,.12);stroke-width:1}
.oc-tl .subsplit{stroke:rgba(255,255,255,.07);stroke-width:1;stroke-dasharray:2 4}
.oc-tl .colnum{font:600 10.5px ui-monospace,monospace;fill:rgba(255,255,255,.3)}
.oc-tl .colnum.lit{fill:var(--accent)}
.oc-tl .colhead{font-size:11.5px;fill:rgba(255,255,255,.5)}
.oc-tl .colhead.lit{fill:#fff;font-weight:600}
.oc-tl .gutter svg{color:rgba(255,255,255,.55)}
.oc-tl .lane{font-size:13px;font-weight:600;fill:rgba(255,255,255,.85)}
.oc-tl .track{font-size:11px;fill:rgba(255,255,255,.55)}
.oc-tl .hint{font-size:9.5px;fill:rgba(255,255,255,.3)}
.oc-tl .mk{stroke-width:1;transition:fill .35s,stroke .35s}
.oc-tl .mk.future{fill:var(--panel);stroke:rgba(255,255,255,.22)}
.oc-tl .mk.past{fill:#3a332c;stroke:rgba(255,255,255,.38)}
.oc-tl .mk.now{fill:var(--accent);stroke:var(--accent-hi);filter:url(#oc-tl-glow)}
.oc-tl .mk.partial{stroke-dasharray:3 3}
.oc-tl .mk.unchecked.now{fill:url(#oc-tl-hatch)}
.oc-tl .hatch-bg{fill:#4a1e07}
.oc-tl .hatch-line{stroke:var(--accent);stroke-width:2.5}
.oc-tl .lb{font-size:12px;transition:fill .35s}
.oc-tl .lb.in{font-size:11px}
.oc-tl .lb.future{fill:rgba(255,255,255,.35)}
.oc-tl .lb.past{fill:rgba(255,255,255,.75)}
.oc-tl .lb.in.now{fill:#fff;font-weight:600}
.oc-tl .lb.out.now{fill:var(--accent-hi);font-weight:600}
.oc-tl .link{fill:none;stroke-width:1.2;stroke-linejoin:round;transition:stroke .35s}
.oc-tl .link.future{stroke:rgba(255,255,255,.12)}
.oc-tl .link.past{stroke:rgba(255,255,255,.3)}
.oc-tl .link.now{stroke:var(--accent);filter:url(#oc-tl-glow)}
.oc-tl .link.partial{stroke-dasharray:3 3}
.oc-tl .head path{stroke:none}
.oc-tl .head.future path{fill:rgba(255,255,255,.14)}
.oc-tl .head.past path{fill:rgba(255,255,255,.35)}
.oc-tl .head.now path{fill:var(--accent)}
.oc-tl .pulse{fill:none;stroke:var(--accent-hi);stroke-width:2.4;stroke-linecap:round;stroke-dasharray:90 910;stroke-dashoffset:1000;filter:url(#oc-tl-glow);animation:oc-tl-pulse 1s cubic-bezier(.3,.7,.3,1) .15s forwards}
@keyframes oc-tl-pulse{from{stroke-dashoffset:1000;opacity:1}to{stroke-dashoffset:-90;opacity:0}}
.oc-tl .hit{fill:transparent;cursor:pointer}
.oc-tl .hit:hover{fill:rgba(255,255,255,.025)}
@media (prefers-reduced-motion:reduce){.oc-tl .pulse{display:none}.oc-tl *{transition:none!important}}
`;
