'use client'

import { motion } from 'framer-motion'
import { Video, AudioLines, LayoutList, MessageCircle, Phone, Mail, FileText, ScrollText, Scale, Globe, Search, Map, FileStack } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { LucideIcon } from 'lucide-react'

interface StepDef {
    icon: LucideIcon
    titleKey: string
    descriptionKey: string
    secondaryIcons?: LucideIcon[]
}

const INPUTS: StepDef[] = [
    { icon: Video, titleKey: 'inputs.recording.title', descriptionKey: 'inputs.recording.description' },
    { icon: FileStack, titleKey: 'inputs.documents.title', descriptionKey: 'inputs.documents.description' },
]

const PROCESSING_STEPS: StepDef[] = [
    { icon: AudioLines, titleKey: 'processing.transcription.title', descriptionKey: 'processing.transcription.description' },
    { icon: LayoutList, titleKey: 'processing.analysis.title', descriptionKey: 'processing.analysis.description' },
]

const BRANCHES: StepDef[] = [
    { icon: MessageCircle, titleKey: 'branches.notifications.title', descriptionKey: 'branches.notifications.description', secondaryIcons: [Phone, Mail] },
    { icon: Globe, titleKey: 'branches.openByDefault.title', descriptionKey: 'branches.openByDefault.description', secondaryIcons: [Search, Map] },
    { icon: FileText, titleKey: 'branches.tools.title', descriptionKey: 'branches.tools.description', secondaryIcons: [ScrollText, Scale] },
]

/**
 * Animated flow line: gray static track + orange pulse traveling along it.
 * Uses pathLength="1" so all paths are normalized regardless of actual length.
 * The CSS animation moves a short orange segment from start to end of path.
 */
function FlowLine({ d, delay, duration }: { d: string; delay: number; duration: number }) {
    return (
        <>
            {/* Static gray dashed track */}
            <path
                d={d}
                stroke="#d4d4d8"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="6 4"
            />
            {/* Orange flowing pulse */}
            <path
                d={d}
                stroke="hsl(24, 90%, 55%)"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                pathLength="1"
                strokeDasharray="0.15 0.85"
                style={{
                    animation: `flow ${duration}s ease-in-out ${delay}s infinite`,
                }}
            />
        </>
    )
}

/** Arrow head — pulses orange when flow reaches it */
function FlowArrow({ d, delay, duration }: { d: string; delay: number; duration: number }) {
    return (
        <path
            d={d}
            stroke="#d4d4d8"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            style={{
                animation: `arrow-pulse ${duration}s ease-in-out ${delay}s infinite`,
            }}
        />
    )
}

/** Horizontal connector between pipeline steps */
function HorizontalConnector({ delay }: { delay: number }) {
    return (
        <div className="hidden lg:flex items-center flex-shrink-0 w-10 xl:w-14">
            <svg className="w-full h-8" viewBox="0 0 56 32" fill="none" preserveAspectRatio="none">
                <FlowLine d="M 0 16 L 56 16" delay={delay} duration={2} />
                <FlowArrow d="M 48 10 L 56 16 L 48 22" delay={delay} duration={2} />
            </svg>
        </div>
    )
}

/** Vertical connector for mobile */
function VerticalConnector({ delay }: { delay: number }) {
    return (
        <div className="lg:hidden flex justify-center py-2">
            <svg className="w-8 h-10" viewBox="0 0 32 40" fill="none">
                <FlowLine d="M 16 0 L 16 40" delay={delay} duration={2} />
                <FlowArrow d="M 10 32 L 16 40 L 22 32" delay={delay} duration={2} />
            </svg>
        </div>
    )
}

/** Step card */
function StepCard({ step, index, delay, t }: { step: StepDef; index: number; delay: number; t: (key: string) => string }) {
    return (
        <motion.div
            className="flex-1 max-w-[240px] mx-auto lg:mx-0 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
            viewport={{ once: true }}
        >
            <div className="relative mx-auto mb-4 h-14 w-14 rounded-2xl bg-primary/5 flex items-center justify-center">
                <step.icon className="h-6 w-6 text-primary" />
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                    {index}
                </span>
            </div>
            <h3 className="text-sm font-semibold mb-1.5">{t(step.titleKey)}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed px-2">{t(step.descriptionKey)}</p>
            {step.secondaryIcons && (
                <div className="flex items-center justify-center gap-2 mt-3">
                    {step.secondaryIcons.map((Icon, i) => (
                        <div key={i} className="h-7 w-7 rounded-lg bg-primary/5 flex items-center justify-center">
                            <Icon className="h-3.5 w-3.5 text-primary/60" />
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    )
}

export default function HowItWorks() {
    const t = useTranslations('about.howItWorks')

    return (
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
                <motion.div
                    className="text-center mb-12 md:mb-16"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-light tracking-tight">
                        {t('title')} <span className="font-medium">{t('titleHighlight')}</span>
                    </h2>
                    <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                        {t('subtitle')}
                    </p>
                </motion.div>

                {/* ── Two inputs ── */}
                <div className="lg:flex lg:items-start lg:justify-center lg:gap-24">
                    {INPUTS.map((input, index) => (
                        <div key={input.titleKey} className="contents">
                            <StepCard step={input} index={index + 1} delay={index * 0.15} t={t} />
                            {index === 0 && (
                                <VerticalConnector delay={0.3} />
                            )}
                        </div>
                    ))}
                </div>

                {/* ── Merge: 2 inputs converge into processing ── */}

                {/* Desktop merge SVG — 2 inputs (240+96+240=576), centers at 120 & 456, merge point at 288 */}
                <div className="hidden lg:flex justify-center my-6">
                    <svg className="w-[576px] h-16" viewBox="0 0 576 64" fill="none">
                        {/* Left input down and right */}
                        <FlowLine d="M 120 0 L 120 20 Q 120 40, 288 40 L 288 44" delay={0.5} duration={2.5} />
                        {/* Right input down and left */}
                        <FlowLine d="M 456 0 L 456 20 Q 456 40, 288 40 L 288 44" delay={0.5} duration={2.5} />
                        {/* Merged stem down */}
                        <FlowLine d="M 288 44 L 288 64" delay={0.8} duration={2.5} />
                        <FlowArrow d="M 282 56 L 288 64 L 294 56" delay={0.8} duration={2.5} />
                    </svg>
                </div>

                {/* Mobile merge */}
                <VerticalConnector delay={0.5} />

                {/* ── Processing: 2 linear steps ── */}
                <div className="lg:flex lg:items-start lg:justify-center">
                    {PROCESSING_STEPS.map((step, index) => (
                        <div key={step.titleKey} className="contents">
                            <StepCard step={step} index={index + 3} delay={0.3 + index * 0.15} t={t} />
                            {index < PROCESSING_STEPS.length - 1 && (
                                <>
                                    <HorizontalConnector delay={0.8} />
                                    <VerticalConnector delay={0.8} />
                                </>
                            )}
                        </div>
                    ))}
                </div>

                {/* ── Fork: processing splits into 3 branches ── */}

                {/* Desktop fork SVG — 3 cards: 240*3 + 96*2 = 912px, centers at 120, 456, 792 */}
                <div className="hidden lg:flex justify-center my-6">
                    <svg className="w-[912px] h-16" viewBox="0 0 912 64" fill="none">
                        {/* Center stem down */}
                        <FlowLine d="M 456 0 L 456 24" delay={1} duration={2.5} />
                        {/* Left branch */}
                        <FlowLine d="M 456 24 Q 456 44, 120 44 L 120 64" delay={1.3} duration={2.5} />
                        <FlowArrow d="M 114 56 L 120 64 L 126 56" delay={1.3} duration={2.5} />
                        {/* Middle branch */}
                        <FlowLine d="M 456 24 L 456 64" delay={1.3} duration={2.5} />
                        <FlowArrow d="M 450 56 L 456 64 L 462 56" delay={1.3} duration={2.5} />
                        {/* Right branch */}
                        <FlowLine d="M 456 24 Q 456 44, 792 44 L 792 64" delay={1.3} duration={2.5} />
                        <FlowArrow d="M 786 56 L 792 64 L 798 56" delay={1.3} duration={2.5} />
                    </svg>
                </div>

                {/* Mobile fork */}
                <VerticalConnector delay={1} />

                {/* ── Three branches ── */}
                <div className="lg:flex lg:justify-center lg:gap-24">
                    {BRANCHES.map((branch, index) => (
                        <div key={branch.titleKey} className="contents">
                            <StepCard step={branch} index={index + 5} delay={0.8 + index * 0.15} t={t} />
                            {index < BRANCHES.length - 1 && (
                                <VerticalConnector delay={1.5} />
                            )}
                        </div>
                    ))}
                </div>
            </section>
    )
}
