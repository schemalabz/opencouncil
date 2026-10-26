'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { RECOGNITION_ITEMS, type RecognitionItem } from './config'
import { Container, Kicker, recordFont, reveal, revealDelayed } from './primitives'

const headline = RECOGNITION_ITEMS.find((item) => item.kind === 'headline')
const awards = RECOGNITION_ITEMS.filter((item) => item.kind === 'award')
const mentions = RECOGNITION_ITEMS.filter((item) => item.kind === 'mention')

/** A municipality's own words, and the rooms that recognised the work. */
export default function ProofSection() {
    const t = useTranslations('about.proof')

    const logo = (item: RecognitionItem, width: number, height: number) => (
        <Image src={item.logoUrl} alt="" width={width} height={height} className={cn('object-contain', item.logoClassName)} />
    )

    return (
        <section id="proof" className="scroll-mt-20 md:scroll-mt-36 border-t border-border bg-[#fafaf9] py-14 md:py-[88px]">
            <Container>
                <div className="grid grid-cols-1 gap-12 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start md:gap-[72px]">
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

                    <div className="flex flex-col gap-5">
                        <Kicker tone="muted">{t('awardsTitle')}</Kicker>

                        {headline && (
                            <motion.a
                                {...reveal}
                                href={headline.linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-start gap-5 no-underline hover:no-underline"
                            >
                                <div className="shrink-0 pt-0.5">{logo(headline, 212, 240)}</div>
                                <div className="flex flex-col gap-1.5">
                                    <div className="text-[19px] font-semibold leading-tight tracking-[-0.01em] text-foreground group-hover:underline md:text-[22px]">
                                        {t(`items.${headline.id}.title`)}
                                    </div>
                                    <div className="max-w-[46ch] text-[14.5px] leading-relaxed text-muted-foreground text-pretty">
                                        {t(`items.${headline.id}.subtitle`)}
                                    </div>
                                </div>
                            </motion.a>
                        )}

                        <div className="grid grid-cols-1 gap-6 border-t border-border pt-6 sm:grid-cols-3 sm:gap-6">
                            {awards.map((item, index) => (
                                <motion.a
                                    key={item.id}
                                    {...revealDelayed(0.08 + index * 0.06)}
                                    href={item.linkUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex flex-col gap-4 no-underline hover:no-underline"
                                >
                                    <div className="flex h-10 items-end">{logo(item, 160, 48)}</div>
                                    <div className="flex flex-col gap-1">
                                        <div className="text-[15px] font-semibold leading-snug text-foreground group-hover:underline">
                                            {t(`items.${item.id}.title`)}
                                        </div>
                                        <div className="text-[13.5px] leading-relaxed text-muted-foreground">{t(`items.${item.id}.subtitle`)}</div>
                                    </div>
                                </motion.a>
                            ))}
                        </div>

                        <div className="flex flex-col gap-3.5 border-t border-border pt-6">
                            {mentions.map((item, index) => (
                                <motion.p
                                    key={item.id}
                                    {...revealDelayed(0.2 + index * 0.06)}
                                    className="m-0 grid grid-cols-[72px_minmax(0,1fr)] items-start gap-x-4 text-[14.5px] leading-relaxed text-muted-foreground sm:grid-cols-[88px_minmax(0,1fr)]"
                                >
                                    <span className="flex h-[22px] items-center">{logo(item, 160, 48)}</span>
                                    <span>
                                        <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground">
                                            {t(`items.${item.id}.title`)}
                                        </a>
                                        {', '}
                                        {t(`items.${item.id}.subtitle`)}.
                                    </span>
                                </motion.p>
                            ))}
                        </div>
                    </div>
                </div>
            </Container>
        </section>
    )
}
