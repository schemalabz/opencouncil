'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import ContactFormPopup from '@/components/static/ContactFormPopup'
import Pricing from '@/components/static/Pricing'
import Hero from './Hero'
import SocialProof from './SocialProof'
import OpennessFeatures from './OpennessFeatures'
import InternalFeatures from './InternalFeatures'
import Quotes from './Quotes'
import Recognition from './Recognition'
import HowItWorks from './HowItWorks'
import Team from './Team'
import CTAFooter from './CTAFooter'
import type { AboutPageStats } from '@/lib/db/cities'
import type { GitHubStats } from '@/lib/github'

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

            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                {/* 1. Hero */}
                <Hero onContactClick={() => setIsContactFormOpen(true)} stats={stats} />

                {/* 2. Social Proof */}
                <SocialProof citiesWithLogos={citiesWithLogos} />

                {/* 3. Axis 1 — Ανοιχτότητα */}
                <OpennessFeatures />
            </div>

            {/* 4. Axis 2 — Εσωτερικές λειτουργίες (full-width gray bg) */}
            <InternalFeatures />

            {/* 5. Πώς δουλεύει */}
            <HowItWorks />

            {/* 6. Quotes (full-width warm bg) */}
            <Quotes />

            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                {/* 6. Recognition */}
                <Recognition />

                {/* 7. Pricing */}
                <section className="py-16 md:py-24">
                    <Pricing />
                </section>
            </div>

            {/* 8. Team (full-width gray bg) */}
            <Team githubStats={githubStats} />

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
