"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * The conversation, bubble by bubble. `caption` marks the bubble that completes
 * a beat — the line below the chat is the last one reached, so the two user
 * questions do not each need their own.
 */
const STEPS = [
    { from: 'notis', message: 'notisMsg1', caption: 'notisBeat1' },
    { from: 'user', message: 'notisMsg2', caption: 'notisBeat2' },
    { from: 'notis', message: 'notisMsg3', caption: 'notisBeat3' },
    { from: 'user', message: 'notisMsg4' },
    { from: 'notis', message: 'notisMsg5', caption: 'notisBeat4' },
    { from: 'user', message: 'notisMsg6' },
    { from: 'notis', message: 'notisMsg7', caption: 'notisBeat5' },
] as const;

const CAPTIONS = STEPS.flatMap(step => ('caption' in step ? [step.caption] : []));
const BEATS = CAPTIONS.length;
/** Long enough to read as Νότης composing, short enough not to be a wait. */
const TYPING_MS = 700;
/** One unprompted move teaches that the card is tappable; after it, the reader drives. */
const FIRST_NUDGE_MS = 2600;

/** The About page's NotificationDemo wallpaper, so the two surfaces match. */
const CHAT_SURFACE = {
    backgroundColor: '#ECE5DD',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9c2b7' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
};

/**
 * An example exchange with Νότης, advanced one message at a time.
 *
 * A static bubble says what a notification looks like; playing the conversation
 * says what he is — that he reads the κοινότητες too, that you can answer him,
 * that the figures come from the minutes, and that one word ends it. Each
 * message is the evidence for the line underneath it.
 *
 * Every fact in the script is from a real record: a square redesign approved
 * unanimously by an Athens δημοτική κοινότητα in June 2026 — the cost, the
 * deadline, the planting, and the reason it cannot legally be called a
 * playground. The place is left unnamed because this card renders for every
 * municipality, which is also why the pane is labelled as an example.
 */
export function NotisConversation() {
    const t = useTranslations('cityOverview');
    const [shown, setShown] = useState(1);
    const [typing, setTyping] = useState(false);
    const [nudged, setNudged] = useState(false);
    const [awake, setAwake] = useState(false);
    const paneRef = useRef<HTMLDivElement>(null);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (query.matches) {
            setReduced(true);
            setShown(STEPS.length);
        }
    }, []);

    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const advance = useCallback(() => {
        setNudged(true);
        setShown(current => {
            if (current >= STEPS.length) return 1;
            if (STEPS[current].from === 'notis' && !reduced) {
                setTyping(true);
                timers.current.push(setTimeout(() => {
                    setTyping(false);
                    setShown(next => Math.min(next + 1, STEPS.length));
                }, TYPING_MS));
                return current;
            }
            return current + 1;
        });
    }, [reduced]);

    // The nudge is cancelled by any interaction, including one that lands first.
    useEffect(() => {
        if (reduced || nudged) return;
        const timer = setTimeout(advance, FIRST_NUDGE_MS);
        return () => clearTimeout(timer);
    }, [reduced, nudged, advance]);

    const advanceByHand = useCallback(() => {
        setAwake(true);
        advance();
    }, [advance]);

    useEffect(() => {
        const pane = paneRef.current;
        if (!pane) return;
        pane.scrollTo({ top: pane.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
    }, [shown, typing, reduced]);

    const visible = STEPS.slice(0, shown);
    const caption = [...visible].reverse().find(step => 'caption' in step)?.caption ?? STEPS[0].caption;
    const beat = visible.filter(step => 'caption' in step).length;
    const finished = shown >= STEPS.length && !typing;

    return (
        <div>
            <div className="relative">
            <span className="pointer-events-none absolute right-2.5 top-2.5 z-10 rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] text-[#667781]">
                {t('notisExampleLabel')}
            </span>
            <div
                ref={paneRef}
                role="button"
                tabIndex={0}
                aria-label={finished ? t('notisReplay') : t('notisAdvance')}
                onClick={advanceByHand}
                onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        advanceByHand();
                    }
                }}
                // Dimmed until it is touched: at rest the card should read as one
                // quiet block rather than a screenshot of another app, and the
                // hover is what says the chat is playable. Once the reader has
                // played a message it stays lit — they know what it is now.
                className={cn(
                    'scrollbar-hide flex h-[190px] cursor-pointer flex-col gap-1.5 overflow-y-auto p-3 transition-opacity duration-500',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/40',
                    awake ? 'opacity-100' : 'opacity-[0.55] hover:opacity-100 focus-visible:opacity-100',
                )}
                style={CHAT_SURFACE}
            >
                {visible.map((step, i) => (
                    <Bubble key={step.message} from={step.from} text={t(step.message)} animate={!reduced && i === shown - 1} />
                ))}
                {typing && <TypingBubble />}
            </div>
            </div>

            <div className="flex items-start justify-between gap-3 px-4 pt-3">
                {/* Every caption occupies the same grid cell, so the row is as tall
                    as the longest one and the card cannot resize between steps —
                    in any locale, without a magic number. The inactive ones fade
                    out rather than disappearing, which is what carries the eye
                    from the message that earned the line down to the line. */}
                <p className="grid flex-1">
                    {CAPTIONS.map(key => (
                        <span
                            key={key}
                            aria-hidden={key !== caption}
                            className={cn(
                                'col-start-1 row-start-1 text-[13px] leading-relaxed text-foreground/80 transition-opacity duration-300',
                                key === caption ? 'opacity-100' : 'pointer-events-none opacity-0',
                            )}
                        >
                            {t(key)}
                        </span>
                    ))}
                </p>
                <span className="flex shrink-0 items-center gap-1.5 pt-1.5">
                    {finished ? (
                        <button
                            type="button"
                            onClick={advanceByHand}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <RotateCcw className="h-3 w-3" aria-hidden />
                            {t('notisReplay')}
                        </button>
                    ) : (
                        Array.from({ length: BEATS }, (_, i) => (
                            <span
                                key={i}
                                className={cn(
                                    'h-1.5 w-1.5 rounded-full transition-colors',
                                    i < beat ? 'bg-foreground/70' : 'bg-foreground/15',
                                )}
                                aria-hidden
                            />
                        ))
                    )}
                </span>
            </div>
        </div>
    );
}

function Bubble({ from, text, animate }: { from: 'notis' | 'user'; text: string; animate: boolean }) {
    const notis = from === 'notis';
    return (
        <div
            className={cn(
                'relative max-w-[86%] rounded-lg px-2.5 pb-1.5 pt-1.5 shadow-[0_1px_1px_rgba(0,0,0,0.09)]',
                notis ? 'self-start rounded-tl-none bg-white' : 'self-end rounded-tr-none bg-[#d9fdd3]',
                animate && 'animate-in fade-in slide-in-from-bottom-1 duration-300',
            )}
        >
            <span
                className={cn(
                    'absolute top-0 h-0 w-0',
                    notis
                        ? '-left-[7px] border-l-[7px] border-t-[8px] border-l-transparent border-t-white'
                        : '-right-[7px] border-r-[7px] border-t-[8px] border-r-transparent border-t-[#d9fdd3]',
                )}
                aria-hidden
            />
            <span className="block text-[12.5px] leading-[17px] text-[#111B21]">{text}</span>
        </div>
    );
}

function TypingBubble() {
    return (
        <div className="relative max-w-[86%] self-start rounded-lg rounded-tl-none bg-white px-3 py-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.09)]">
            <span
                className="absolute -left-[7px] top-0 h-0 w-0 border-l-[7px] border-t-[8px] border-l-transparent border-t-white"
                aria-hidden
            />
            <span className="flex items-center gap-1" aria-hidden>
                {[0, 150, 300].map(delay => (
                    <span
                        key={delay}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8696a0]"
                        style={{ animationDelay: `${delay}ms`, animationDuration: '900ms' }}
                    />
                ))}
            </span>
        </div>
    );
}
