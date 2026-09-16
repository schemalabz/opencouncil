'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MotionConfig } from 'framer-motion'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { ChevronUp } from 'lucide-react'
import type { Realm } from '@prisma/client'
import type { RealmStage } from '@/lib/realm'
import type { AboutPageStats } from '@/lib/db/cities'
import type { GitHubStats } from '@/lib/github'
import ContactFormPopup from './ContactFormPopup'
import { cn } from '@/lib/utils'
import Hero from './Hero'
import MunicipalityStrip from './MunicipalityStrip'
import ResidentsSection from './ResidentsSection'
import ServicesSection from './ServicesSection'
import ProcessSection from './ProcessSection'
import ProofSection from './ProofSection'
import PricingSection from './PricingSection'
import PricingCalculatorDialog from './PricingCalculatorDialog'
import PilotSection from './PilotSection'
import TeamSection from './TeamSection'
import ClosingCta from './ClosingCta'
import { shotsForRealm } from './config'

const SECTION_IDS = {
    active: ['residents', 'services', 'process', 'proof', 'pricing', 'team'],
    pending: ['residents', 'services', 'process', 'proof', 'pilot', 'team'],
} as const

type SectionId = (typeof SECTION_IDS)[RealmStage][number]

/** Scroll progress bar: direct DOM mutation, no React re-renders. */
function ScrollProgressBar() {
    const barRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const onScroll = () => {
            if (!barRef.current) return
            const docHeight = document.documentElement.scrollHeight - window.innerHeight
            const progress = docHeight > 0 ? window.scrollY / docHeight : 0
            barRef.current.style.transform = `scaleX(${progress})`
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    return <div ref={barRef} className="fixed left-0 right-0 top-0 z-50 h-0.5 origin-left bg-[hsl(var(--orange))]/60" style={{ transform: 'scaleX(0)' }} />
}

/** Which section is on screen, and whether the reader has scrolled past the hero. */
function useSectionNav(sectionIds: readonly SectionId[]) {
    const [active, setActive] = useState<string | null>(null)
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const sectionEls = sectionIds.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
        if (!sectionEls.length) return

        const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.6)
        window.addEventListener('scroll', onScroll, { passive: true })
        onScroll()

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) setActive(entry.target.id)
                }
            },
            { rootMargin: '-20% 0px -60% 0px' },
        )
        sectionEls.forEach((el) => observer.observe(el))

        return () => {
            window.removeEventListener('scroll', onScroll)
            observer.disconnect()
        }
    }, [sectionIds])

    const scrollTo = useCallback((id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, [])

    return { active, visible, scrollTo }
}

interface NavProps {
    active: string | null
    visible: boolean
    scrollTo: (id: string) => void
    sectionIds: readonly SectionId[]
}

/** Desktop: a floating pill of section links at the top once the hero is gone. */
function DesktopNav({ active, visible, scrollTo, sectionIds }: NavProps) {
    const t = useTranslations('about.nav')

    return (
        <nav
            aria-hidden={!visible}
            className={cn(
                // Just under the site header, which is sticky and 80px tall on this breakpoint: a pill on top of it was unclickable.
                'fixed left-1/2 top-[92px] z-40 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-border/60 bg-white/80 px-1.5 py-1 shadow-sm backdrop-blur-md transition-[opacity,transform] duration-300 md:flex',
                visible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
            )}
        >
            <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="mr-0.5 h-6 w-6 shrink-0 overflow-hidden rounded-full transition-opacity hover:opacity-80"
                aria-label="Scroll to top"
            >
                <Image src="/logo.png" alt="" width={24} height={24} className="h-full w-full object-cover" />
            </button>
            {sectionIds.map((id) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => scrollTo(id)}
                    className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        active === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                >
                    {t(id)}
                </button>
            ))}
        </nav>
    )
}

/** Phone: a bottom pill naming the current section; tap for the list. */
function MobileNav({ active, visible, scrollTo, sectionIds }: NavProps) {
    const t = useTranslations('about.nav')
    const [expanded, setExpanded] = useState(false)

    useEffect(() => {
        if (!expanded) return
        const close = () => setExpanded(false)
        window.addEventListener('scroll', close, { passive: true, once: true })
        return () => window.removeEventListener('scroll', close)
    }, [expanded])

    if (!visible) return null

    return (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center md:hidden">
            {expanded && (
                <nav className="absolute bottom-full mb-2 flex min-w-[180px] flex-col gap-0.5 rounded-2xl border border-border/60 bg-white/95 p-2 shadow-lg backdrop-blur-md">
                    {sectionIds.map((id) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => {
                                scrollTo(id)
                                setExpanded(false)
                            }}
                            className={cn(
                                'rounded-xl px-4 py-2 text-left text-sm font-medium transition-colors',
                                active === id ? 'bg-foreground text-background' : 'text-muted-foreground active:bg-muted',
                            )}
                        >
                            {t(id)}
                        </button>
                    ))}
                </nav>
            )}
            <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="flex items-center gap-2 rounded-full border border-border/60 bg-white/90 py-1.5 pl-3 pr-2.5 shadow-md backdrop-blur-md transition-transform active:scale-95"
            >
                <Image src="/logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0 rounded-full object-cover" />
                <span className="text-xs font-medium text-foreground">{active ? t(active) : 'OpenCouncil'}</span>
                <ChevronUp className={cn('h-3 w-3 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')} />
            </button>
        </div>
    )
}

interface AboutPageProps {
    citiesWithLogos?: Array<{ id: string; logoImage: string; name_municipality: string; name_municipality_en: string; href: string }>
    stats?: AboutPageStats | null
    githubStats?: GitHubStats | null
    /** Realm of the current request: picks the screenshots, the demo links, the phone number. */
    realm: Realm
    /** Whether the realm sells yet (pricing) or is after its first pilot (the pilot band). */
    stage: RealmStage
}

export default function AboutPage({ citiesWithLogos = [], stats, githubStats, realm, stage }: AboutPageProps) {
    const [contact, setContact] = useState<{ open: boolean; calculatedPrice: number | null }>({ open: false, calculatedPrice: null })
    const [calculatorOpen, setCalculatorOpen] = useState(false)
    const sectionIds = SECTION_IDS[stage]
    const navProps = useSectionNav(sectionIds)
    const shots = useMemo(() => shotsForRealm(realm), [realm])

    const openContact = useCallback(() => setContact({ open: true, calculatedPrice: null }), [])
    const closeContact = useCallback(() => setContact((c) => ({ ...c, open: false })), [])
    const onEstimate = useCallback((yearlyCost: number) => {
        setCalculatorOpen(false)
        setContact({ open: true, calculatedPrice: yearlyCost })
    }, [])

    return (
        <MotionConfig reducedMotion="user">
            <div className="min-h-screen">
                <ScrollProgressBar />
                <DesktopNav {...navProps} sectionIds={sectionIds} />
                <MobileNav {...navProps} sectionIds={sectionIds} />

                <Hero realm={realm} stage={stage} shots={shots} onContactClick={openContact} />
                <MunicipalityStrip citiesWithLogos={citiesWithLogos} stats={stats} stage={stage} />
                <ResidentsSection shots={shots} />
                <ServicesSection realm={realm} shots={shots} />
                <ProcessSection />
                <ProofSection />
                {stage === 'active' ? (
                    <PricingSection onCalculate={() => setCalculatorOpen(true)} onContactClick={openContact} />
                ) : (
                    <PilotSection realm={realm} onContactClick={openContact} />
                )}
                <TeamSection githubStats={githubStats} realm={realm} />
                <ClosingCta realm={realm} stage={stage} onContactClick={openContact} />

                <PricingCalculatorDialog open={calculatorOpen} onOpenChange={setCalculatorOpen} onEstimate={onEstimate} />
                <ContactFormPopup isOpen={contact.open} onClose={closeContact} calculatedPrice={contact.calculatedPrice} realm={realm} />
            </div>
        </MotionConfig>
    )
}
