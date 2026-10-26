'use client'

import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { RECOGNITION_ITEMS } from './config'
import { Container, Kicker, recordFont, reveal, revealDelayed } from './primitives'

/** A municipality's own words, and the rooms that recognised the work. */
export default function ProofSection() {
    const t = useTranslations('about.proof')

    return (
        <section id="proof" className="scroll-mt-20 md:scroll-mt-36 border-t border-border bg-[#fafaf9] py-14 md:py-[88px]">
            <Container>
                <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start md:gap-[72px]">
                    <motion.figure {...reveal} className="m-0 flex flex-col gap-5 md:sticky md:top-36">
                        <Kicker>{t('kicker')}</Kicker>
                        <blockquote className="relative m-0 pl-1 pt-[30px]">
                            <span
                                aria-hidden
                                className="pointer-events-none absolute -left-1 -top-0.5 select-none text-[72px] leading-none text-[hsl(var(--orange))]/40"
                                style={recordFont}
                            >
                                &ldquo;
                            </span>
                            <p className="text-[21px] leading-[1.4] text-foreground text-pretty md:text-[26px]" style={recordFont}>
                                {t('quote')}
                            </p>
                        </blockquote>
                        <figcaption className="flex flex-col gap-0.5 text-[13.5px] leading-snug">
                            <span className="font-semibold text-foreground">{t('name')}</span>
                            <span className="text-muted-foreground">{t('org')}</span>
                        </figcaption>
                    </motion.figure>

                    <div className="flex flex-col gap-4">
                        <Kicker tone="muted">{t('awardsTitle')}</Kicker>
                        {/* A ledger, not a logo wall: each row names who recognised the work and for what. */}
                        <ol className="m-0 list-none border-t border-border p-0">
                            {RECOGNITION_ITEMS.map((item, index) => (
                                <motion.li key={item.id} {...revealDelayed(index * 0.05)} className="border-b border-border">
                                    <a
                                        href={item.linkUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-4 no-underline hover:no-underline md:grid-cols-[104px_minmax(0,1fr)_auto] md:py-[18px]"
                                    >
                                        <span className="col-span-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground md:col-span-1 md:pt-[3px]">
                                            {t(`items.${item.id}.label`)}
                                        </span>
                                        <span className="flex min-w-0 flex-col gap-1">
                                            <span className="text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-[hsl(var(--orange-deep))]">
                                                {t(`items.${item.id}.title`)}
                                            </span>
                                            <span className="text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
                                                {t(`items.${item.id}.subtitle`)}
                                            </span>
                                        </span>
                                        <ArrowUpRight
                                            aria-hidden
                                            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60 transition-[color,transform] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[hsl(var(--orange-deep))]"
                                            strokeWidth={2}
                                        />
                                    </a>
                                </motion.li>
                            ))}
                        </ol>
                    </div>
                </div>
            </Container>
        </section>
    )
}
