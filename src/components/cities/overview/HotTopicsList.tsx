"use client";
import { useState } from 'react';
import { motion } from 'framer-motion';
import type { HotSubjectCard } from '@/lib/hotSubjectCards';
import { HotTopicLead } from './HotTopicLead';
import { HotTopicRow } from './HotTopicRow';

/** Long enough to read as the list re-flowing, short enough not to sit between
 *  a click and the answer. */
const SWAP = { duration: 0.22, ease: [0.32, 0.72, 0, 1] } as const;

interface HotTopicsListProps {
    cards: HotSubjectCard[];
    cityId: string;
    timezone: string;
    locale: string;
}

/**
 * The ranking, with one entry open at a time.
 *
 * A collapsed row shows a title and a debate time — enough to scan, rarely
 * enough to decide whether the subject is worth opening. Expanding in place
 * answers that without a page load, and keeps the reader's position in the
 * ranking, which navigating away costs them.
 *
 * The top entry starts open because it is the one the page is claiming matters.
 *
 * Both halves of the swap are animated. The height change is what tells the
 * reader the ranking re-flowed around their click rather than reloading, and
 * the opening entry fades in behind it so the taller layout does not appear
 * fully drawn before it has room. `layout` on the row handles the collapse of
 * whichever entry was open.
 */
export function HotTopicsList({ cards, cityId, timezone, locale }: HotTopicsListProps) {
    const [openId, setOpenId] = useState(cards[0]?.subject.id ?? null);
    const maxSeconds = Math.max(0, ...cards.map(c => c.stats.speakingSeconds));
    // The ranking re-computes every 15 minutes, so a refresh can drop the open
    // subject out of the set while this instance survives. Falling back to the
    // leader keeps the section's one invariant — something is always open.
    const open = cards.some(card => card.subject.id === openId) ? openId : cards[0]?.subject.id ?? null;

    return (
        <div className="overflow-hidden rounded-2xl border border-foreground/60 bg-card">
            {cards.map((card, i) => (
                <motion.div key={card.subject.id} layout transition={SWAP}>
                    {card.subject.id === open ? (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={SWAP}>
                            <HotTopicLead
                                card={card}
                                rank={i + 1}
                                maxSeconds={maxSeconds}
                                cityId={cityId}
                                timezone={timezone}
                                locale={locale}
                            />
                        </motion.div>
                    ) : (
                        <HotTopicRow
                            card={card}
                            rank={i + 1}
                            maxSeconds={maxSeconds}
                            timezone={timezone}
                            locale={locale}
                            onOpen={() => setOpenId(card.subject.id)}
                        />
                    )}
                </motion.div>
            ))}
        </div>
    );
}
