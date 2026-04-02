"use client"

import { useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { PhoneCall, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CONTACT_PHONE, CONTACT_PHONE_DISPLAY } from './config'

interface CTAFooterProps {
    onContactClick: () => void
}

export default function CTAFooter({ onContactClick }: CTAFooterProps) {
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
        <div
            className="relative bg-[#0a0a0a] text-white overflow-hidden"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            {/* Base grid — faint, always visible */}
            <div className="absolute inset-0"
                style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
                    backgroundSize: '48px 48px',
                }}
            />

            {/* Bright grid — masked by radial gradient following the mouse. Only grid lines glow, not the background. */}
            <div
                ref={glowRef}
                className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-500"
                style={{
                    backgroundImage: 'linear-gradient(rgba(255,160,60,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,160,60,0.4) 1px, transparent 1px)',
                    backgroundSize: '48px 48px',
                    maskImage: 'radial-gradient(circle 250px at var(--mouse-x, 50%) var(--mouse-y, 50%), black 0%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(circle 250px at var(--mouse-x, 50%) var(--mouse-y, 50%), black 0%, transparent 100%)',
                }}
            />

            <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
                <motion.div
                    className="text-center"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-light tracking-tight">
                        Φέρετε τα συλλογικά όργανα του δήμου σας στο σήμερα.
                    </h2>
                    <p className="mt-4 text-base md:text-lg text-white/60 max-w-lg mx-auto">
                        Το OpenCouncil μπορεί να ξεκινήσει στο δήμο σας σε ημέρες — όχι σε μήνες.
                    </p>

                    <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
                        <Button
                            size="lg"
                            onClick={onContactClick}
                            className="bg-white hover:bg-white/90 text-[#0a0a0a] rounded-xl px-8 py-6 text-base transition-colors duration-300"
                        >
                            <CalendarClock className="mr-2 h-4 w-4" />
                            Κλείστε μία παρουσίαση
                        </Button>
                        <a href={`tel:${CONTACT_PHONE}`} className="inline-flex no-underline [&_*]:no-underline">
                            <Button
                                size="lg"
                                className="bg-transparent border border-white/30 text-white hover:bg-white/10 rounded-xl px-8 py-6 text-base w-full transition-colors duration-300"
                            >
                                <PhoneCall className="mr-2 h-4 w-4" />
                                {CONTACT_PHONE_DISPLAY}
                            </Button>
                        </a>
                    </div>
                </motion.div>
            </section>
        </div>
    )
}
