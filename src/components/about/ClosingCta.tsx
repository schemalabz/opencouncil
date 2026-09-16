'use client'

import { useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, PhoneCall, Rocket } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Realm } from '@prisma/client'
import { getRealmContactPhone, telHref, type RealmStage } from '@/lib/realm'
import { Container, PillButton, reveal } from './primitives'

interface ClosingCtaProps {
    realm: Realm
    stage: RealmStage
    onContactClick: () => void
}

/** The dark band at the end: the one ask, repeated, on a grid that warms under the pointer. */
export default function ClosingCta({ realm, stage, onContactClick }: ClosingCtaProps) {
    const t = useTranslations('about.cta')
    const tHero = useTranslations('about.hero')
    const contactPhone = getRealmContactPhone(realm)
    const glowRef = useRef<HTMLDivElement>(null)

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!glowRef.current) return
        const rect = e.currentTarget.getBoundingClientRect()
        glowRef.current.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`)
        glowRef.current.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`)
        glowRef.current.style.opacity = '1'
    }, [])

    const handleMouseLeave = useCallback(() => {
        if (glowRef.current) glowRef.current.style.opacity = '0'
    }, [])

    return (
        <section className="relative overflow-hidden bg-[#0a0a0a] text-white" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
            {/* Base grid, faint and always there */}
            <div
                aria-hidden
                className="absolute inset-0"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
                    backgroundSize: '48px 48px',
                }}
            />
            {/* The same grid in orange, masked to a disc that follows the pointer: only the lines glow. */}
            <div
                ref={glowRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(255,160,60,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,160,60,0.4) 1px, transparent 1px)',
                    backgroundSize: '48px 48px',
                    maskImage: 'radial-gradient(circle 250px at var(--mouse-x, 50%) var(--mouse-y, 50%), black 0%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(circle 250px at var(--mouse-x, 50%) var(--mouse-y, 50%), black 0%, transparent 100%)',
                }}
            />

            <Container className="relative py-16 md:py-24">
                <motion.div {...reveal} className="flex flex-col items-center gap-4 text-center md:gap-5">
                    <h2 className="max-w-[760px] !text-[28px] !font-normal !leading-[1.12] tracking-[-0.02em] !text-center text-white text-balance md:!text-[40px]">
                        {t('title')}
                    </h2>
                    <p className="max-w-[520px] text-base leading-relaxed text-white/60 text-pretty md:text-lg">{t('subtitle')}</p>
                    <div className="mt-1 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:justify-center sm:gap-3 md:mt-3">
                        {stage === 'pending' ? (
                            <PillButton icon={Rocket} dark onClick={onContactClick}>{tHero('becomePilot')}</PillButton>
                        ) : (
                            <PillButton icon={CalendarClock} dark onClick={onContactClick}>{t('scheduleCall')}</PillButton>
                        )}
                        <PillButton icon={PhoneCall} dark variant="outline" href={telHref(contactPhone)}>{contactPhone}</PillButton>
                    </div>
                </motion.div>
            </Container>
        </section>
    )
}
