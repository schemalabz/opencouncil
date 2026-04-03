'use client'

import { motion } from 'framer-motion'
import { Video, AudioLines, LayoutList, MessageCircle, Phone, Mail, FileText, ScrollText, Scale } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Step {
    icon: LucideIcon
    title: string
    description: string
}

const PIPELINE_STEPS: Step[] = [
    {
        icon: Video,
        title: 'Μαγνητοσκόπηση',
        description: 'Η συνεδρίαση καταγράφεται ή ανεβαίνει από YouTube — αρκεί ένα βίντεο ή ηχητικό αρχείο.',
    },
    {
        icon: AudioLines,
        title: 'Απομαγνητοφώνηση',
        description: 'AI μεταγραφή με αναγνώριση ομιλητών, ελεγμένη από άνθρωπο σε 48 ώρες.',
    },
    {
        icon: LayoutList,
        title: 'Ανάλυση & δομή',
        description: 'Αυτόματη κατάτμηση σε θέματα, περιλήψεις, τοποθετήσεις ανά ομιλητή και αποφάσεις.',
    },
]

interface Branch {
    icon: LucideIcon
    title: string
    description: string
    secondaryIcons: LucideIcon[]
}

const BRANCHES: Branch[] = [
    {
        icon: MessageCircle,
        title: 'Ειδοποιήσεις δημοτών',
        description: 'Οι δημότες ενημερώνονται για τα θέματα που τους αφορούν, μέσω WhatsApp, SMS και email.',
        secondaryIcons: [Phone, Mail],
    },
    {
        icon: FileText,
        title: 'Εργαλεία για αιρετούς & υπηρεσιακούς',
        description: 'Πρακτικά, απομαγνητοφωνήσεις και αποφάσεις — έτοιμα για χρήση.',
        secondaryIcons: [ScrollText, Scale],
    },
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
function StepCard({ step, index, delay }: { step: Step | Branch; index: number; delay: number }) {
    const secondaryIcons = 'secondaryIcons' in step ? step.secondaryIcons : undefined
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
            <h3 className="text-sm font-semibold mb-1.5">{step.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed px-2">{step.description}</p>
            {secondaryIcons && (
                <div className="flex items-center justify-center gap-2 mt-3">
                    {secondaryIcons.map((Icon, i) => (
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
                        Πώς <span className="font-medium">δουλεύει</span>
                    </h2>
                    <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                        Από τη συνεδρίαση, στον δήμο και στον δημότη — αυτόματα
                    </p>
                </motion.div>

                {/* ── Pipeline: 3 linear steps ── */}
                <div className="lg:flex lg:items-start lg:justify-center">
                    {PIPELINE_STEPS.map((step, index) => (
                        <div key={step.title} className="contents">
                            <StepCard step={step} index={index + 1} delay={index * 0.15} />
                            {index < PIPELINE_STEPS.length - 1 && (
                                <>
                                    <HorizontalConnector delay={index * 0.5} />
                                    <VerticalConnector delay={index * 0.5} />
                                </>
                            )}
                        </div>
                    ))}
                </div>

                {/* ── Fork: step 3 splits into 2 branches ── */}

                {/* Desktop fork SVG — matches branch container: 240 + 96 + 240 = 576px, centers at 120 and 456 */}
                <div className="hidden lg:flex justify-center my-6">
                    <svg className="w-[576px] h-16" viewBox="0 0 576 64" fill="none">
                        {/* Center stem down */}
                        <FlowLine d="M 288 0 L 288 24" delay={1} duration={2.5} />
                        {/* Left branch: center → left card center (120) → down */}
                        <FlowLine d="M 288 24 Q 288 44, 120 44 L 120 64" delay={1.3} duration={2.5} />
                        <FlowArrow d="M 114 56 L 120 64 L 126 56" delay={1.3} duration={2.5} />
                        {/* Right branch: center → right card center (456) → down */}
                        <FlowLine d="M 288 24 Q 288 44, 456 44 L 456 64" delay={1.3} duration={2.5} />
                        <FlowArrow d="M 450 56 L 456 64 L 462 56" delay={1.3} duration={2.5} />
                    </svg>
                </div>

                {/* Mobile fork */}
                <VerticalConnector delay={1} />

                {/* ── Two branches ── */}
                <div className="lg:flex lg:justify-center lg:gap-24">
                    {BRANCHES.map((branch, index) => (
                        <div key={branch.title} className="contents">
                            <StepCard step={branch} index={index + 4} delay={0.8 + index * 0.15} />
                            {index === 0 && (
                                <VerticalConnector delay={1.5} />
                            )}
                        </div>
                    ))}
                </div>
            </section>
    )
}
