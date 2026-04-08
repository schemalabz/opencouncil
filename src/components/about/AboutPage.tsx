'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { ChevronUp } from 'lucide-react'
import ContactFormPopup from '@/components/static/ContactFormPopup'
import Pricing from '@/components/static/Pricing'
import Hero from './Hero'
import SocialProof from './SocialProof'
import OpennessFeatures from './OpennessFeatures'
import InternalFeatures from './InternalFeatures'
import Recognition from './Recognition'
import HowItWorks from './HowItWorks'
import Team from './Team'
import CTAFooter from './CTAFooter'
import type { AboutPageStats } from '@/lib/db/cities'
import type { GitHubStats } from '@/lib/github'

const SECTION_IDS = ['openness', 'internal', 'how-it-works', 'recognition', 'pricing', 'team'] as const

/** Scroll progress bar — direct DOM mutation, no React re-renders */
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

    return (
        <div
            ref={barRef}
            className="fixed top-0 left-0 right-0 h-0.5 bg-primary/50 z-50 origin-left"
            style={{ transform: 'scaleX(0)' }}
        />
    )
}

/** Shared hook for section visibility + active tracking */
function useSectionNav() {
    const [active, setActive] = useState<string | null>(null)
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const sectionEls = SECTION_IDS.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[]
        if (!sectionEls.length) return

        const onScroll = () => {
            setVisible(window.scrollY > window.innerHeight * 0.6)
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        onScroll()

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setActive(entry.target.id)
                    }
                }
            },
            { rootMargin: '-20% 0px -60% 0px' }
        )

        sectionEls.forEach(el => observer.observe(el))

        return () => {
            window.removeEventListener('scroll', onScroll)
            observer.disconnect()
        }
    }, [])

    const scrollTo = useCallback((id: string) => {
        const el = document.getElementById(id)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, [])

    return { active, visible, scrollTo }
}

/** Desktop: floating pill nav at top */
function DesktopNav() {
    const t = useTranslations('about.nav')
    const { active, visible, scrollTo } = useSectionNav()

    if (!visible) return null

    return (
        <nav className="fixed top-3 left-1/2 -translate-x-1/2 z-40 hidden md:flex items-center gap-1 bg-white/80 backdrop-blur-md border border-border/50 rounded-full px-1.5 py-1 shadow-sm">
            <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="flex-shrink-0 w-6 h-6 rounded-full overflow-hidden mr-0.5 hover:opacity-80 transition-opacity"
                aria-label="Scroll to top"
            >
                <Image src="/logo.png" alt="" width={24} height={24} className="w-full h-full object-cover" />
            </button>
            {SECTION_IDS.map(id => (
                <button
                    key={id}
                    onClick={() => scrollTo(id)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                        active === id
                            ? 'bg-primary text-white'
                            : 'text-muted-foreground hover:text-foreground hover:bg-gray-100'
                    }`}
                >
                    {t(id)}
                </button>
            ))}
        </nav>
    )
}

/** Mobile: bottom pill showing current section, expands to full list on tap */
function MobileNav() {
    const t = useTranslations('about.nav')
    const { active, visible, scrollTo } = useSectionNav()
    const [expanded, setExpanded] = useState(false)

    // Close when scrolling
    useEffect(() => {
        if (!expanded) return
        const close = () => setExpanded(false)
        window.addEventListener('scroll', close, { passive: true, once: true })
        return () => window.removeEventListener('scroll', close)
    }, [expanded])

    if (!visible) return null

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 md:hidden flex flex-col items-center">
            {/* Expanded list — positioned above the pill */}
            {expanded && (
                <nav className="absolute bottom-full mb-2 bg-white/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-lg p-2 flex flex-col gap-0.5 min-w-[180px]">
                    {SECTION_IDS.map(id => (
                        <button
                            key={id}
                            onClick={() => {
                                scrollTo(id)
                                setExpanded(false)
                            }}
                            className={`px-4 py-2 text-sm font-medium rounded-xl text-left transition-colors ${
                                active === id
                                    ? 'bg-primary text-white'
                                    : 'text-muted-foreground active:bg-gray-100'
                            }`}
                        >
                            {t(id)}
                        </button>
                    ))}
                </nav>
            )}

            {/* Pill — always anchored at bottom */}
            <button
                onClick={() => setExpanded(prev => !prev)}
                className="flex items-center gap-2 bg-white/90 backdrop-blur-md border border-border/50 rounded-full pl-3 pr-2.5 py-1.5 shadow-md active:scale-95 transition-transform"
            >
                <Image src="/logo.png" alt="" width={18} height={18} className="w-[18px] h-[18px] shrink-0 rounded-full object-cover" />
                <span className="text-xs font-medium text-foreground">
                    {active ? t(active) : 'OpenCouncil'}
                </span>
                <ChevronUp className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </button>
        </div>
    )
}

interface AboutPageProps {
    citiesWithLogos?: Array<{ id: string; logoImage: string; name_municipality: string }>
    stats?: AboutPageStats | null
    githubStats?: GitHubStats | null
}

export default function AboutPage({ citiesWithLogos = [], stats, githubStats }: AboutPageProps) {
    const [isContactFormOpen, setIsContactFormOpen] = useState(false)

    return (
        <div className="min-h-screen">
            <ScrollProgressBar />
            <DesktopNav />
            <MobileNav />

            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                {/* 1. Hero */}
                <Hero onContactClick={() => setIsContactFormOpen(true)} stats={stats} />

                {/* 2. Social Proof */}
                <SocialProof citiesWithLogos={citiesWithLogos} />

                {/* 3. Openness features */}
                <div id="openness">
                    <OpennessFeatures />
                </div>
            </div>

            {/* 4. Internal features */}
            <div id="internal">
                <InternalFeatures />
            </div>

            {/* 5. How it works */}
            <div id="how-it-works">
                <HowItWorks />
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                {/* 6. Recognition (includes quote) */}
                <div id="recognition">
                    <Recognition />
                </div>

                {/* 7. Pricing */}
                <div id="pricing">
                    <section className="py-16 md:py-24">
                        <Pricing />
                    </section>
                </div>
            </div>

            {/* 8. Team (full-width gray bg) */}
            <div id="team">
                <Team githubStats={githubStats} />
            </div>

            {/* 9. CTA Footer (full-width primary bg) */}
            <CTAFooter onContactClick={() => setIsContactFormOpen(true)} />

            {/* Contact form popup (shared for Hero + CTAFooter) */}
            <ContactFormPopup
                isOpen={isContactFormOpen}
                onClose={() => setIsContactFormOpen(false)}
            />
        </div>
    )
}
