'use client'

import { motion } from 'framer-motion'
import { PhoneCall, Rocket } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Realm } from '@prisma/client'
import { getRealmContactPhone, telHref } from '@/lib/realm'
import { PILOT_POINTS } from './config'
import { Container, PillButton, SectionHeading, reveal, revealDelayed } from './primitives'

interface PilotSectionProps {
    realm: Realm
    onContactClick: () => void
}

/** On a realm without a paying municipality yet, the ask is the first pilot, not a price. */
export default function PilotSection({ realm, onContactClick }: PilotSectionProps) {
    const t = useTranslations('about.pilot')
    const tHero = useTranslations('about.hero')
    const contactPhone = getRealmContactPhone(realm)

    return (
        <section id="pilot" className="scroll-mt-20 md:scroll-mt-36 border-t border-border py-14 md:py-[88px]">
            <Container>
                <motion.div {...reveal} className="flex flex-col gap-6 rounded-[20px] bg-[hsl(24,100%,96%)] p-6 sm:p-8 md:gap-9 md:p-14">
                    <SectionHeading kicker={t('kicker')} title={t(`title.${realm}`)} subtitle={t('subtitle')} className="max-w-[760px]" />

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-5">
                        {PILOT_POINTS.map((point, index) => {
                            const Icon = point.icon
                            return (
                                <motion.div
                                    key={point.id}
                                    {...revealDelayed(index * 0.08)}
                                    className="flex flex-col gap-2.5 rounded-[14px] border border-[hsl(var(--orange-deep))]/[0.12] bg-white/70 p-5 md:p-6"
                                >
                                    <Icon className="h-[22px] w-[22px] text-[hsl(var(--orange-deep))]" strokeWidth={1.7} aria-hidden />
                                    <h3 className="text-[17px] font-semibold leading-tight text-foreground">{t(`points.${point.id}.title`)}</h3>
                                    <p className="text-sm leading-relaxed text-muted-foreground">{t(`points.${point.id}.description`)}</p>
                                </motion.div>
                            )
                        })}
                    </div>

                    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3">
                        <PillButton icon={Rocket} onClick={onContactClick}>{tHero('becomePilot')}</PillButton>
                        <PillButton icon={PhoneCall} variant="outline" href={telHref(contactPhone)}>{contactPhone}</PillButton>
                    </div>
                </motion.div>
            </Container>
        </section>
    )
}
