'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Realm } from '@prisma/client'
import { getRealmDomain } from '@/lib/realm'
import BrowserFrame from './BrowserFrame'
import { PhonePanel } from './PhonePanel'
import { serviceFeaturesForRealm, type RealmShots } from './config'
import { Container, SectionHeading, recordFont, reveal, revealDelayed } from './primitives'

/** What keeps a municipality: the record and the tools the staff use every week. */
export default function ServicesSection({ realm, shots }: { realm: Realm; shots: RealmShots }) {
    const t = useTranslations('about.services')
    const features = serviceFeaturesForRealm(realm)
    const meetingPath = shots.subjectPath?.replace(/\/subjects\/.*$/, '') ?? ''
    const frameUrl = `${getRealmDomain(realm)}${meetingPath}${meetingPath ? '/transcript' : ''}`
    const transcript = shots.shots['staff-transcript']

    // The minutes the transcript turns into, resting on the frame's corner.
    const minutes = (
        <motion.div
            {...revealDelayed(0.35)}
            className="absolute bottom-0 right-0 flex w-[250px] flex-col gap-1.5 rounded-[14px] border border-border bg-card px-4 py-3.5 shadow-[0_24px_50px_-24px_rgba(12,10,9,0.4)] md:-right-7 md:w-[316px]"
        >
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{t('minutes.kicker')}</div>
            <div className="text-[13.5px] font-semibold leading-snug text-foreground">{t('minutes.title')}</div>
            <div className="text-xs leading-relaxed text-muted-foreground" style={recordFont}>{t('minutes.meta')}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#15803d]">
                <Check className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
                <span>{t('minutes.status')}</span>
            </div>
        </motion.div>
    )

    return (
        <section id="services" className="scroll-mt-20 md:scroll-mt-36 border-t border-border py-14 md:py-[88px]">
            <Container>
                <SectionHeading kicker={t('kicker')} title={t('title')} subtitle={t('subtitle')} />

                <div className="mt-7 grid grid-cols-1 items-start gap-9 md:mt-12 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-16">
                    <motion.div {...reveal} className="relative pb-8 md:pb-[34px]">
                        <div className="hidden md:block">
                            <BrowserFrame url={frameUrl} className="shadow-[0_30px_60px_-28px_rgba(12,10,9,0.3),0_1px_2px_rgba(12,10,9,0.06)]">
                                <Image
                                    src={transcript.src}
                                    alt={t('frameAlt')}
                                    width={transcript.width}
                                    height={transcript.height}
                                    sizes="(min-width: 1280px) 660px, 55vw"
                                    className="block h-auto w-full"
                                />
                            </BrowserFrame>
                        </div>
                        <div className="md:hidden">
                            <PhonePanel shot={shots.shots['mobile-transcript']} alt={t('frameAlt')} height={400} inset={28} sizes="100vw" />
                        </div>
                        {minutes}
                    </motion.div>

                    <div className="flex flex-col">
                        {features.map((feature, index) => {
                            const Icon = feature.icon
                            return (
                                <motion.div key={feature.id} {...revealDelayed(index * 0.08)} className="flex gap-4 border-t border-border py-[18px] md:py-5">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                                        <Icon className="h-[19px] w-[19px]" strokeWidth={1.8} aria-hidden />
                                    </span>
                                    <div className="flex min-w-0 flex-col gap-1.5">
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <h3 className="text-[17px] font-semibold leading-tight text-foreground">{t(`features.${feature.id}.title`)}</h3>
                                            {feature.status === 'upcoming' && (
                                                <span className="inline-flex h-[22px] items-center rounded-full bg-[hsl(24,100%,96%)] px-2.5 text-[11px] font-bold tracking-[0.02em] text-[hsl(var(--orange-deep))]">
                                                    {t(`features.${feature.id}.badge`)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm leading-relaxed text-muted-foreground">{t(`features.${feature.id}.description`)}</p>
                                    </div>
                                </motion.div>
                            )
                        })}
                        <div className="border-t border-border" />
                    </div>
                </div>

                <motion.div
                    {...reveal}
                    className="mt-9 flex items-center gap-[18px] rounded-2xl bg-[hsl(24,100%,96%)] px-[22px] py-[22px] md:mt-14 md:px-9 md:py-7"
                >
                    <Sparkles className="h-6 w-6 shrink-0 text-[hsl(var(--orange-deep))]" strokeWidth={1.6} aria-hidden />
                    <p className="text-base leading-snug text-foreground text-pretty md:text-xl">{t('punchline')}</p>
                </motion.div>
            </Container>
        </section>
    )
}
