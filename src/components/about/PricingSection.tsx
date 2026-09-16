'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, Check } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { getIntlLocale } from '@/lib/formatters/time'
import { PLATFORM_PRICING_TIERS, SESSION_PROCESSING, getCombinedProcessingPrice } from '@/lib/pricing'
import { Container, Kicker, PillButton, SectionHeading, recordFont, reveal, revealDelayed } from './primitives'

interface PricingSectionProps {
    onCalculate: () => void
    onContactClick: () => void
}

function CheckItem({ children }: { children: string }) {
    return (
        <li className="flex items-start gap-2.5 text-sm leading-snug text-foreground">
            <Check className="mt-0.5 h-[15px] w-[15px] shrink-0 text-[hsl(var(--orange-deep))]" strokeWidth={2.4} aria-hidden />
            <span>{children}</span>
        </li>
    )
}

function Price({ value, unit }: { value: string; unit: string }) {
    return (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[34px] font-semibold tracking-[-0.02em] text-foreground tabular-nums md:text-[40px]" style={recordFont}>
                {value}
            </span>
            <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
    )
}

/** Both prices on one screen, what every subscription includes, and the calculator. Active realms only. */
export default function PricingSection({ onCalculate, onContactClick }: PricingSectionProps) {
    const t = useTranslations('about.pricing')
    const tHero = useTranslations('about.hero')
    const locale = useLocale()
    // Whole euros, in the visitor's locale: "20 €" on the Greek site, "€20" on the English one.
    const euro = useMemo(
        () => new Intl.NumberFormat(getIntlLocale(locale), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }),
        [locale],
    )
    const formatCurrency = (value: number) => euro.format(value)
    const processing = getCombinedProcessingPrice()
    const tierLabels = t.raw('tiers') as string[]
    const sessionChecklist = [...(t.raw('sessionChecklist') as string[]), ...(t.raw('sessionChecklistExtra') as string[])]
    const includes = t.raw('extras.items') as string[]
    const additional = t.raw('extras.additionalItems') as string[]
    const monthly = PLATFORM_PRICING_TIERS.map((tier) => tier.monthlyPrice)
    const platformRange = `${formatCurrency(Math.min(...monthly))} – ${formatCurrency(Math.max(...monthly))}`

    const card = 'flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 md:p-8'

    return (
        <section id="pricing" className="scroll-mt-20 md:scroll-mt-36 border-t border-border py-14 md:py-[88px]">
            <Container>
                <SectionHeading kicker={t('kicker')} title={t('title')} subtitle={t('subtitle')} />

                <div className="mt-7 grid grid-cols-1 gap-4 md:mt-11 md:grid-cols-2 md:gap-6">
                    <motion.div {...reveal} className={card}>
                        <Kicker>{t('sessionProcessing')}</Kicker>
                        <Price value={formatCurrency(processing.pricePerHour)} unit={t('perHourSession')} />
                        <p className="text-sm leading-relaxed text-muted-foreground">{t('sessionProcessingDesc')}</p>
                        <ul className="flex flex-col gap-2.5 pt-1">
                            {sessionChecklist.map((item) => (
                                <CheckItem key={item}>{item}</CheckItem>
                            ))}
                        </ul>
                        <p className="mt-auto border-t border-border pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                            {t('archiveNote', { price: formatCurrency(SESSION_PROCESSING.pricePerHour) })}
                        </p>
                    </motion.div>

                    <motion.div {...revealDelayed(0.1)} className={card}>
                        <Kicker>{t('platformUsage')}</Kicker>
                        <Price value={platformRange} unit={t('perMonthBy')} />
                        <p className="text-sm leading-relaxed text-muted-foreground">{t('platformSummary')}</p>
                        <dl className="flex flex-col pt-0.5">
                            {PLATFORM_PRICING_TIERS.map((tier, index) => (
                                <div
                                    key={tier.label}
                                    className={index === 0 ? 'flex justify-between gap-3 py-2 text-sm' : 'flex justify-between gap-3 border-t border-border py-2 text-sm'}
                                >
                                    <dt className="text-foreground">{tierLabels[index] ?? tier.label}</dt>
                                    <dd className="m-0 font-medium text-foreground tabular-nums" style={recordFont}>
                                        {tier.monthlyPrice === 0 ? t('free') : `${formatCurrency(tier.monthlyPrice)} ${t('perMonth')}`}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </motion.div>
                </div>

                <motion.div {...reveal} className="mt-7 flex flex-col gap-4 md:mt-10">
                    <Kicker tone="muted">{t('extras.subtitle')}</Kicker>
                    <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:gap-x-6 md:gap-y-3 xl:grid-cols-4">
                        {includes.map((item) => (
                            <CheckItem key={item}>{item}</CheckItem>
                        ))}
                    </ul>
                    {additional.length > 0 && (
                        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                            {t('extras.additionalCharges')} {additional.join(' · ')}
                        </p>
                    )}
                </motion.div>

                <motion.div {...reveal} className="mt-7 flex flex-col gap-5 md:mt-10 md:flex-row md:items-center md:justify-between md:gap-8">
                    <p className="max-w-[620px] text-[12.5px] leading-relaxed text-muted-foreground">{t('vatNote')}</p>
                    <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row sm:gap-3">
                        <PillButton variant="outline" onClick={onCalculate}>{t('calculateContract')}</PillButton>
                        <PillButton icon={CalendarClock} onClick={onContactClick}>{tHero('scheduleCall')}</PillButton>
                    </div>
                </motion.div>
            </Container>
        </section>
    )
}
