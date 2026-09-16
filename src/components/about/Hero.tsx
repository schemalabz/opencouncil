'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { CalendarClock, PhoneCall, Rocket } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Realm } from '@prisma/client'
import { getRealmContactPhone, getRealmDomain, telHref, type RealmStage } from '@/lib/realm'
import BrowserFrame from './BrowserFrame'
import { PhonePanel } from './PhonePanel'
import { Container, Kicker, PillButton } from './primitives'
import { HERO_AUDIENCES, type RealmShots } from './config'

interface HeroProps {
    realm: Realm
    stage: RealmStage
    shots: RealmShots
    onContactClick: () => void
}

const rise = (delay: number) => ({
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
})

export default function Hero({ realm, stage, shots, onContactClick }: HeroProps) {
    const t = useTranslations('about.hero')
    const pending = stage === 'pending'
    const contactPhone = getRealmContactPhone(realm)
    // The frame names the page it shows: the city's own page on the realm's domain.
    const cityPath = shots.subjectPath?.match(/^\/[^/]+/)?.[0] ?? ''
    const frameUrl = `${getRealmDomain(realm)}${cityPath}`
    const heroShot = shots.shots['hero-desktop']

    return (
        <section className="pt-10 pb-2 md:pt-20 md:pb-10">
            <Container className="grid grid-cols-1 items-center gap-10 md:grid-cols-[minmax(0,11fr)_minmax(0,10fr)] md:gap-14">
                <div className="flex flex-col items-start gap-[18px] md:gap-6">
                    <motion.div {...rise(0)}>
                        {pending ? (
                            <div className="inline-flex items-start gap-2 rounded-2xl bg-[hsl(24,100%,96%)] py-[7px] pl-2.5 pr-3 text-[12.5px] font-semibold leading-snug text-[hsl(var(--orange-deep))]">
                                <span aria-hidden className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full bg-[hsl(var(--orange))]" />
                                <span>{t(`pilot.${realm}`)}</span>
                            </div>
                        ) : (
                            <Kicker>{t('kicker')}</Kicker>
                        )}
                    </motion.div>

                    <motion.h1
                        {...rise(0.08)}
                        className="text-[34px] font-normal leading-[1.08] tracking-[-0.025em] text-foreground text-balance sm:text-[44px] lg:text-[54px]"
                    >
                        {t('title')} <em>{t('titleHighlight')}</em>
                    </motion.h1>

                    <motion.ul {...rise(0.16)} className="m-0 flex list-none flex-col gap-2.5 p-0 text-base leading-relaxed text-muted-foreground md:gap-3 md:text-lg">
                        {HERO_AUDIENCES.map(({ id, icon: Icon }) => (
                            <li key={id} className="flex items-start gap-3">
                                <Icon className="mt-[5px] h-[18px] w-[18px] shrink-0 text-[hsl(var(--orange-deep))]" strokeWidth={1.8} aria-hidden />
                                <span className="text-pretty">
                                    <span className="font-semibold text-foreground">{t(`audiences.${id}.lead`)}</span> {t(`audiences.${id}.text`)}
                                </span>
                            </li>
                        ))}
                    </motion.ul>

                    <motion.div {...rise(0.24)} className="mt-1 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:gap-3 md:mt-2">
                        {pending ? (
                            <>
                                <PillButton icon={Rocket} onClick={onContactClick}>{t('becomePilot')}</PillButton>
                                <PillButton icon={CalendarClock} variant="outline" onClick={onContactClick}>{t('scheduleCall')}</PillButton>
                            </>
                        ) : (
                            <>
                                <PillButton icon={CalendarClock} onClick={onContactClick}>{t('scheduleCall')}</PillButton>
                                <PillButton icon={PhoneCall} variant="outline" href={telHref(contactPhone)}>{contactPhone}</PillButton>
                            </>
                        )}
                    </motion.div>
                </div>

                {/* Desktop: the subject page in a browser, leaning in a little and settling flat on hover. */}
                <motion.div
                    className="hidden md:block md:pl-2"
                    initial={{ opacity: 0, x: 28 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div className="animate-float">
                        <div className="[transform:perspective(1400px)_rotateY(-6deg)_rotateX(2deg)] transition-transform duration-700 ease-out hover:[transform:none]">
                            <BrowserFrame url={frameUrl} className="shadow-[0_30px_60px_-28px_rgba(12,10,9,0.35),0_1px_2px_rgba(12,10,9,0.06)]">
                                <Image
                                    src={heroShot.src}
                                    alt={t('frameAlt')}
                                    width={heroShot.width}
                                    height={heroShot.height}
                                    sizes="(min-width: 1280px) 600px, 48vw"
                                    priority
                                    className="block h-auto w-full"
                                />
                            </BrowserFrame>
                        </div>
                    </div>
                </motion.div>

                {/* Phone: the same subject page, on a phone. */}
                <motion.div {...rise(0.32)} className="md:hidden">
                    <PhonePanel shot={shots.shots['mobile-subject']} alt={t('frameAlt')} height={440} inset={28} sizes="100vw" priority />
                </motion.div>
            </Container>
        </section>
    )
}
