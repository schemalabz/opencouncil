import { motion } from 'framer-motion'
import { PhoneCall, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import NumberTicker from '@/components/magicui/number-ticker'
import BrowserFrame from './BrowserFrame'
import ShineTitle from './ShineTitle'
import { HERO_COUNTERS, CONTACT_PHONE, CONTACT_PHONE_DISPLAY } from './config'
import type { AboutPageStats } from '@/lib/db/cities'
import type { HeroCounter } from './config'

interface HeroProps {
    onContactClick: () => void
    stats?: AboutPageStats | null
}

function getCounters(stats?: AboutPageStats | null): HeroCounter[] {
    if (!stats) return HERO_COUNTERS

    return [
        { value: stats.municipalityCount, label: 'δήμοι' },
        { value: stats.subjectCount, suffix: '+', label: 'θέματα' },
        { value: stats.meetingHours, suffix: '+', label: 'ώρες συνεδριάσεων' },
    ]
}

export default function Hero({ onContactClick, stats }: HeroProps) {
    const counters = getCounters(stats)
    return (
        <section className="relative pt-2 pb-8 sm:py-12 md:py-20 lg:py-28">
            {/* Mobile background screenshot — faded, right-aligned, behind text */}
            <motion.div
                className="absolute inset-y-0 right-0 w-[70%] sm:w-[55%] md:hidden pointer-events-none"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.8 }}
                style={{
                    maskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0.7) 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0.7) 100%)',
                }}
            >
                <div
                    className="h-full flex items-center"
                    style={{ transform: 'perspective(1200px) rotateY(-6deg) rotateX(2deg)' }}
                >
                    <BrowserFrame url="opencouncil.gr" className="shadow-xl">
                        <div className="aspect-[4/3] bg-black overflow-hidden">
                            <video
                                src="/about/product-demo.mp4"
                                autoPlay
                                muted
                                loop
                                playsInline
                                className="w-full h-full object-fill"
                            />
                        </div>
                    </BrowserFrame>
                </div>
            </motion.div>

            <div className="relative grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-10 lg:gap-16 items-center">
                {/* Left column — text */}
                <motion.div
                    className="max-w-[65%] sm:max-w-[60%] md:max-w-none relative z-10"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7 }}
                >
                    <ShineTitle className="text-2xl sm:text-3xl md:text-5xl lg:text-[3.25rem] xl:text-[3.5rem] font-light tracking-tight leading-[1.1]">
                        Το λειτουργικό σύστημα{' '}
                        <span className="font-medium">
                            των συλλογικών οργάνων
                        </span>
                    </ShineTitle>

                    <motion.p
                        className="mt-4 sm:mt-6 text-sm sm:text-base md:text-xl text-muted-foreground leading-relaxed"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.6 }}
                    >
                        Δημοτικά συμβούλια, επιτροπές και κοινότητες — πιο ανοιχτά για τους δημότες, πιο αποδοτικά για τις υπηρεσίες.
                    </motion.p>

                    {/* Counters */}
                    <motion.div
                        className="mt-5 sm:mt-8 flex gap-6 sm:gap-8 md:gap-12"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35, duration: 0.6 }}
                    >
                        {counters.map((counter) => (
                            <div key={counter.label} className="flex flex-col">
                                <span
                                    className="text-xl sm:text-3xl md:text-5xl font-semibold tracking-tight text-foreground whitespace-nowrap tabular-nums"
                                    style={{ fontFamily: 'var(--font-roboto), Roboto, sans-serif' }}
                                >
                                    <NumberTicker value={counter.value} delay={0.5} useGrouping={false} />
                                    {counter.suffix && (
                                        <span className="text-primary">{counter.suffix}</span>
                                    )}
                                </span>
                                <span className="mt-1 text-sm text-muted-foreground">
                                    {counter.label}
                                </span>
                            </div>
                        ))}
                    </motion.div>

                    {/* CTAs */}
                    <motion.div
                        className="mt-6 sm:mt-10 flex flex-col sm:flex-row gap-2 sm:gap-3"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.6 }}
                    >
                        <Button
                            size="lg"
                            className="rounded-xl px-6 py-4 sm:px-8 sm:py-6 text-sm sm:text-base shadow-lg hover:shadow-xl transition-all duration-300"
                            onClick={onContactClick}
                        >
                            <CalendarClock className="mr-2 h-4 w-4" />
                            Κλείστε μία παρουσίαση
                        </Button>
                        <a href={`tel:${CONTACT_PHONE}`} className="inline-flex no-underline [&_*]:no-underline">
                            <Button
                                size="lg"
                                variant="outline"
                                className="rounded-xl px-6 py-4 sm:px-8 sm:py-6 text-sm sm:text-base w-full sm:w-auto"
                            >
                                <PhoneCall className="mr-2 h-4 w-4" />
                                {CONTACT_PHONE_DISPLAY}
                            </Button>
                        </a>
                    </motion.div>
                </motion.div>

                {/* Right column — hero screenshot */}
                <motion.div
                    className="relative hidden md:block pr-4"
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
                >
                    <div className="relative animate-float">
                    <div
                        className="relative"
                        style={{ transform: 'perspective(1000px) rotateY(-6deg) rotateX(2deg)' }}
                    >
                        <BrowserFrame url="opencouncil.gr" className="shadow-2xl">
                            <div className="aspect-[4/3] bg-black overflow-hidden">
                                <video
                                    src="/about/product-demo.mp4"
                                    autoPlay
                                    muted
                                    loop
                                    playsInline
                                    className="w-full h-full object-fill"
                                />
                            </div>
                        </BrowserFrame>
                        {/* Decorative shadow */}
                        <div className="absolute -inset-4 -z-10 rounded-2xl bg-primary/[0.03] blur-2xl" />
                    </div>
                    </div>
                </motion.div>
            </div>
        </section>
    )
}
