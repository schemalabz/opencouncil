'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { RESIDENT_FEATURES, residentDemoHref, type RealmShots } from './config'
import { PhonePanel } from './PhonePanel'
import WhatsAppMessage from './WhatsAppMessage'
import { ArrowLink, Container, SectionHeading, revealDelayed } from './primitives'

/** What brings a municipality in: the four things a resident gets, each shown on a phone. */
export default function ResidentsSection({ shots }: { shots: RealmShots }) {
    const t = useTranslations('about.residents')

    return (
        <section id="residents" className="scroll-mt-20 md:scroll-mt-36 border-t border-border py-14 md:py-[88px]">
            <Container>
            <SectionHeading kicker={t('kicker')} title={t('title')} subtitle={t('subtitle')} />

            <div className="mt-8 grid grid-cols-1 gap-4 md:mt-11 md:grid-cols-2 md:gap-5 xl:grid-cols-4">
                {RESIDENT_FEATURES.map((feature, index) => {
                    const href = residentDemoHref(feature.id, shots)
                    const Icon = feature.icon
                    return (
                        <motion.article
                            key={feature.id}
                            {...revealDelayed(index * 0.08)}
                            className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
                        >
                            {feature.shot ? (
                                <PhonePanel
                                    shot={shots.shots[feature.shot]}
                                    alt={t(`features.${feature.id}.title`)}
                                    height={300}
                                    offsetPct={feature.offsetPct}
                                    className="rounded-none"
                                />
                            ) : (
                                <PhonePanel height={300} className="rounded-none">
                                    <WhatsAppMessage />
                                </PhonePanel>
                            )}
                            <div className="flex flex-1 flex-col gap-2 px-5 pb-5 pt-5 md:px-[22px] md:pb-[22px]">
                                <h3 className="flex items-center gap-2 text-[17px] font-semibold leading-tight text-foreground">
                                    <Icon className="h-[18px] w-[18px] shrink-0 text-[hsl(var(--orange-deep))]" strokeWidth={1.9} aria-hidden />
                                    {t(`features.${feature.id}.title`)}
                                </h3>
                                <p className="text-sm leading-relaxed text-muted-foreground">{t(`features.${feature.id}.description`)}</p>
                                {href && (
                                    <ArrowLink href={href} className="mt-auto pt-2">
                                        {t(`features.${feature.id}.link`)}
                                    </ArrowLink>
                                )}
                            </div>
                        </motion.article>
                    )
                })}
            </div>
            </Container>
        </section>
    )
}
