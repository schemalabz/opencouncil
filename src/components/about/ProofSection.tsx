'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { ExternalLink, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { RECOGNITION_ITEMS } from './config'
import { Container, Kicker, recordFont, reveal, revealDelayed } from './primitives'

/** A municipality's own words, and the rooms that recognised the work. */
export default function ProofSection() {
    const t = useTranslations('about.proof')

    return (
        <section id="proof" className="scroll-mt-20 md:scroll-mt-36 border-t border-border bg-[#fafaf9] py-14 md:py-[88px]">
            <Container>
                <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-center md:gap-[72px]">
                    <motion.figure {...reveal} className="m-0 flex flex-col gap-5">
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
                        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
                            {RECOGNITION_ITEMS.map((item, index) => {
                                const title = t(`items.${item.id}.title`)
                                const content = (
                                    <>
                                        {item.linkUrl && (
                                            <ExternalLink
                                                className="absolute right-3.5 top-3.5 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                                aria-hidden
                                            />
                                        )}
                                        <div className="flex h-11 items-center justify-center">
                                            {item.logoUrl ? (
                                                <Image
                                                    src={item.logoUrl}
                                                    alt={title}
                                                    width={160}
                                                    height={48}
                                                    className={cn(
                                                        // Grayscale keeps six brands at one volume; colour comes back on hover.
                                                        'w-auto object-contain opacity-80 grayscale transition-[filter,opacity] duration-300 group-hover:opacity-100 group-hover:grayscale-0',
                                                        item.logoClassName ?? 'max-h-8 max-w-[120px]',
                                                    )}
                                                />
                                            ) : (
                                                <Trophy className="h-7 w-7 text-foreground/70" strokeWidth={1.5} aria-hidden />
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="text-[13px] font-semibold leading-snug text-foreground">{title}</div>
                                            <div className="text-[11.5px] leading-relaxed text-muted-foreground">{t(`items.${item.id}.subtitle`)}</div>
                                        </div>
                                    </>
                                )
                                const cell = 'group relative flex h-full flex-col items-center gap-3 bg-card px-3 py-5 text-center transition-colors md:px-4 md:py-6'
                                return (
                                    <motion.div key={item.id} {...revealDelayed(index * 0.06)} className="h-full">
                                        {item.linkUrl ? (
                                            <a
                                                href={item.linkUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={cn(cell, 'no-underline hover:bg-muted/40 hover:no-underline')}
                                            >
                                                {content}
                                            </a>
                                        ) : (
                                            <div className={cell}>{content}</div>
                                        )}
                                    </motion.div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </Container>
        </section>
    )
}
