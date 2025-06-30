'use client'
import { motion, useScroll, useSpring, useTransform, useInView, useAnimation } from 'framer-motion'
import { PhoneCall, HelpCircle, Search, Database, Mic, FileText, LetterText, BotMessageSquare, Sparkles, Github, Globe, Zap, Clock, ChevronDown, Eye, Users, DatabaseIcon, Building, SearchCheck, Mic2, CalendarClock, Phone, Building2, Vote, Scroll, Mail, Twitter, Linkedin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { useRef, useEffect, useState } from 'react'
import React from 'react'
import ProductRoadmap from './ProductRoadmap'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import Pricing from './Pricing'
import GridPattern from '../magicui/grid-pattern'
import { cn } from '@/lib/utils'
import Particles from '../magicui/particles'
import ShineBorder from '../magicui/shine-border'
import AnimatedGradientText from '../magicui/animated-gradient-text'
import ContactFormPopup from './ContactFormPopup'
import { Link } from '@/i18n/routing'
import Image from 'next/image'
import { FloatingPathsBackground } from '@/components/ui/floating-paths';

const people = [
    {
        name: "Χρήστος Πορίος",
        image: "/people/christos.jpg",
        socials: {
            linkedin: "https://www.linkedin.com/in/christos-porios-91297690/",
            twitter: "https://twitter.com/christosporios",
            email: "mailto:christos@schemalabs.gr"
        }
    },
    {
        name: "Ανδρέας Κούλουμος",
        image: "/people/andreas.jpg",
        socials: {
            linkedin: "https://www.linkedin.com/in/kouloumos/",
            twitter: "https://twitter.com/kouloumos",
            email: "mailto:andreas@schemalabs.gr"
        }
    }
]
function Hero({ setIsContactFormOpen }: { setIsContactFormOpen: (open: boolean) => void }) {
    const t = useTranslations('AboutPage.hero');
    const heroRef = useRef(null)
    const isHeroInView = useInView(heroRef, { once: true })
    const glowControls = useAnimation()

    React.useEffect(() => {
        glowControls.start({
            textShadow: [
                "0 0 3px rgba(255, 150, 150, 0.2), 0 0 6px rgba(255, 150, 150, 0.1), 0 0 9px rgba(255, 150, 150, 0.05)",
                "0 0 4px rgba(255, 150, 150, 0.3), 0 0 8px rgba(255, 150, 150, 0.2), 0 0 12px rgba(255, 150, 150, 0.1)",
                "0 0 3px rgba(255, 150, 150, 0.2), 0 0 6px rgba(255, 150, 150, 0.1), 0 0 9px rgba(255, 150, 150, 0.05)",
            ],
            transition: {
                duration: 3,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
            },
        })
    }, [glowControls])

    return (
        <motion.section
            ref={heroRef}
            className="relative py-12 sm:py-16 md:py-24 flex flex-col justify-center items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
        >
            <div className="flex flex-col items-center justify-center space-y-6">
                <h1 className="text-3xl sm:text-4xl md:text-6xl font-light tracking-tight text-center">
                    {t.rich('title', {
                        div: (chunks) => (
                    <motion.div
                        className="font-medium mt-1 sm:mt-2 md:mt-4 relative"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.6 }}
                    >
                        <motion.span
                            className="relative inline-block text-black"
                            animate={glowControls}
                            whileHover={{
                                scale: 1.03,
                                transition: { duration: 0.3 },
                            }}
                        >
                                    {chunks}
                        </motion.span>
                    </motion.div>
                        )
                    })}
                </h1>
                <motion.p
                    className="text-base sm:text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-3xl text-center leading-relaxed px-4"
                    initial={{ y: 20, opacity: 0 }}
                    animate={isHeroInView ? { y: 0, opacity: 1 } : {}}
                    transition={{ delay: 0.7, duration: 0.8 }}
                >
                    {t('subtitle')}
                </motion.p>
                <motion.div
                    className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 w-full max-w-md sm:max-w-none px-4"
                    initial={{ y: 20, opacity: 0 }}
                    animate={isHeroInView ? { y: 0, opacity: 1 } : {}}
                    transition={{ delay: 0.9, duration: 0.8 }}
                >
                    <Button
                        size="default"
                        className="relative group text-sm sm:text-base px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 bg-primary hover:bg-primary/90 w-full sm:w-auto"
                        onClick={() => setIsContactFormOpen(true)}
                    >
                        <span className="relative z-10 flex items-center justify-center gap-2">
                            <CalendarClock className="h-4 w-4" />
                            {t('contactUs')}
                        </span>
                        <motion.div
                            className="absolute inset-0 rounded-xl bg-primary opacity-0 group-hover:opacity-100 transition-opacity"
                            whileHover={{
                                boxShadow: "0 0 30px rgba(var(--primary), 0.5)"
                            }}
                        />
                    </Button>
                    <a
                        href="tel:+302111980212"
                        className="inline-flex items-center justify-center no-underline w-full sm:w-auto"
                    >
                        <Button
                            size="default"
                            variant="outline"
                            className="text-sm sm:text-base px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 rounded-xl hover:bg-primary/5 transition-colors duration-300 w-full"
                        >
                            <PhoneCall className="mr-2 h-4 w-4" />
                            +30 2111980212
                        </Button>
                    </a>
                </motion.div>
            </div>
            <motion.div
                className="absolute bottom-4 left-1/2 transform -translate-x-1/2"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 0.5, y: 0 }}
                transition={{ delay: 1.2, duration: 0.8, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
            >
                <ChevronDown className="h-6 w-6 text-muted-foreground" />
            </motion.div>
        </motion.section>
    )
}

export default function AboutPage() {
    const t = useTranslations('AboutPage')
    const { scrollYProgress } = useScroll()
    const scaleX = useSpring(scrollYProgress, {
        stiffness: 100,
        damping: 30,
        restDelta: 0.001
    })

    const [isContactFormOpen, setIsContactFormOpen] = useState(false)

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.history.scrollRestoration = 'manual'
        }
    }, [])

    return (
        <div className="min-h-screen">
            <motion.div
                className="fixed top-0 left-0 right-0 h-0.5 bg-primary/50 z-50 origin-left"
                style={{ scaleX }}
            />
            <div className="container mx-auto px-2 sm:px-4">
                {/* Hero Section */}
                <Hero setIsContactFormOpen={setIsContactFormOpen} />

                {/* Why OpenCouncil Section */}
                <motion.section
                    className="py-12 sm:py-16 md:py-24"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-2xl sm:text-3xl font-light text-center mb-12 text-muted-foreground">
                        {t('whyOpenCouncil.title')}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
                        {[
                            { icon: Eye, title: t('whyOpenCouncil.features.0.title'), description: t('whyOpenCouncil.features.0.description') },
                            { icon: DatabaseIcon, title: t('whyOpenCouncil.features.1.title'), description: t('whyOpenCouncil.features.1.description') },
                            { icon: Building, title: t('whyOpenCouncil.features.2.title'), description: t('whyOpenCouncil.features.2.description') },
                        ].map((feature, index) => (
                            <motion.div
                                key={feature.title}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.2, duration: 0.8 }}
                                viewport={{ once: true }}
                            >
                                <Card className="h-full hover:shadow-lg hover:scale-[1.01] transition-all duration-300 bg-background/50 backdrop-blur-sm">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-3 text-base sm:text-lg md:text-xl font-normal">
                                            <feature.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                                            <span>{feature.title}</span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{feature.description}</p>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                    className="text-center py-6 sm:py-8 md:py-16"
                >
                    <Button
                        size="default"
                        className="relative group text-sm sm:text-base md:text-lg px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 bg-primary hover:bg-primary/90"
                        asChild
                    >
                        <Link href="/athens">
                            <span className="relative z-10 flex items-center gap-2">
                                <Building2 className="h-5 w-5" />
                                {t('demo')}
                            </span>
                            <motion.div
                                className="absolute inset-0 rounded-xl bg-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                whileHover={{
                                    boxShadow: "0 0 30px rgba(var(--primary), 0.5)"
                                }}
                            />
                        </Link>
                    </Button>
                </motion.div>

                {/* Feature Showcase */}
                <motion.section
                    className="py-12 sm:py-16 md:py-24"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-2xl sm:text-3xl font-light text-center mb-12 text-muted-foreground">
                        {t('featureShowcase.title')}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
                        {[
                            { icon: <Mic2 className="h-6 w-6" />, title: t('featureShowcase.features.0.title'), description: t('featureShowcase.features.0.description'), badge: <Badge variant="secondary">{t('featureShowcase.features.0.badge')}</Badge> },
                            { icon: <FileText className="h-6 w-6" />, title: t('featureShowcase.features.1.title'), description: t('featureShowcase.features.1.description'), badge: <Badge variant="secondary">{t('featureShowcase.features.1.badge')}</Badge> },
                            { icon: <BotMessageSquare className="h-6 w-6" />, title: t('featureShowcase.features.2.title'), description: t('featureShowcase.features.2.description'), badge: <Badge variant="secondary">{t('featureShowcase.features.2.badge')}</Badge> },
                            { icon: <SearchCheck className="h-6 w-6" />, title: t('featureShowcase.features.3.title'), description: t('featureShowcase.features.3.description'), badge: <Badge variant="secondary">{t('featureShowcase.features.3.badge')}</Badge> },
                            { icon: <Sparkles className="h-6 w-6" />, title: t('featureShowcase.features.4.title'), description: t('featureShowcase.features.4.description'), badge: <Badge variant="secondary">{t('featureShowcase.features.4.badge')}</Badge> },
                            { icon: <Globe className="h-6 w-6" />, title: t('featureShowcase.features.5.title'), description: t('featureShowcase.features.5.description'), badge: <Badge variant="secondary">{t('featureShowcase.features.5.badge')}</Badge> },
                        ].map((feature, index) => (
                            <motion.div
                                key={feature.title}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1, duration: 0.5 }}
                                viewport={{ once: true }}
                            >
                                <FeatureCard
                                    icon={feature.icon}
                                    title={feature.title}
                                    description={feature.description}
                                    badge={feature.badge}
                                />
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                {/* How It Works Section */}
                <motion.section
                    className="py-16 sm:py-24"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-2xl sm:text-3xl font-light text-center mb-16 text-muted-foreground">
                        {t('howItWorks.title')}
                    </h2>
                    <div className="relative">
                        {/* Desktop Timeline */}
                        <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-border -translate-x-1/2" />
                        <div className="hidden md:grid grid-cols-[1fr_auto_1fr] gap-x-8">
                            {[
                                {
                                    icon: <Vote className="h-8 w-8 text-primary" />,
                                    title: t('howItWorks.steps.0.title'),
                                    description: t('howItWorks.steps.0.description')
                                },
                                {
                                    icon: <Scroll className="h-8 w-8 text-primary" />,
                                    title: t('howItWorks.steps.1.title'),
                                    description: t('howItWorks.steps.1.description')
                                },
                                {
                                    icon: <Sparkles className="h-8 w-8 text-primary" />,
                                    title: t('howItWorks.steps.2.title'),
                                    description: t('howItWorks.steps.2.description')
                                },
                                {
                                    icon: <Database className="h-8 w-8 text-primary" />,
                                    title: t('howItWorks.steps.3.title'),
                                    description: t('howItWorks.steps.3.description')
                                }
                            ].map((step, index) => (
                                <React.Fragment key={step.title}>
                                    {index % 2 === 0 ? (
                                        <div className="col-start-1 text-right">
                                            <h3 className="text-lg sm:text-xl font-normal mb-2">{step.title}</h3>
                                            <p className="text-muted-foreground">{step.description}</p>
                                        </div>
                                    ) : (
                                        <div className="col-start-3 text-left">
                                            <h3 className="text-lg sm:text-xl font-normal mb-2">{step.title}</h3>
                                            <p className="text-muted-foreground">{step.description}</p>
                                        </div>
                                    )}
                                    <div className="col-start-2 row-start-1 row-end-5 flex justify-center items-center">
                                        <div className="w-4 h-4 bg-primary rounded-full" />
                                    </div>
                                </React.Fragment>
                            ))}
                        </div>

                        {/* Mobile Timeline */}
                        <div className="md:hidden space-y-12">
                            {[
                                {
                                    icon: <Vote className="h-8 w-8 text-primary" />,
                                    title: t('howItWorks.steps.0.title'),
                                    description: t('howItWorks.steps.0.description')
                                },
                                {
                                    icon: <Scroll className="h-8 w-8 text-primary" />,
                                    title: t('howItWorks.steps.1.title'),
                                    description: t('howItWorks.steps.1.description')
                                },
                                {
                                    icon: <Sparkles className="h-8 w-8 text-primary" />,
                                    title: t('howItWorks.steps.2.title'),
                                    description: t('howItWorks.steps.2.description')
                                },
                                {
                                    icon: <Database className="h-8 w-8 text-primary" />,
                                    title: t('howItWorks.steps.3.title'),
                                    description: t('howItWorks.steps.3.description')
                                }
                            ].map((step, index) => (
                                <div key={step.title} className="flex gap-4">
                                    <div className="flex-shrink-0">
                                        {step.icon}
                                    </div>
                                    <div>
                                        <h3 className="text-lg sm:text-xl font-normal mb-2">{step.title}</h3>
                                        <p className="text-muted-foreground">{step.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.section>

                {/* Team Section */}
                <motion.section
                    className="py-16 sm:py-24"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-2xl sm:text-3xl font-light text-center mb-12 text-muted-foreground">
                        {t('team.title')}
                    </h2>
                    <div className="flex flex-col sm:flex-row justify-center gap-8 md:gap-12">
                        {people.map((person, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1, duration: 0.5 }}
                                viewport={{ once: true }}
                            >
                                <Card className="h-full flex flex-col">
                                    <CardHeader>
                                        <Image src={person.image} alt={person.name} width={128} height={128} className="rounded-full mx-auto" />
                                        <CardTitle className="mt-4 text-lg sm:text-xl font-normal text-center">{person.name}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex justify-center gap-4">
                                        <a href={person.socials.linkedin} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                                            <Linkedin className="w-5 h-5" />
                                        </a>
                                        <a href={person.socials.twitter} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                                            <Twitter className="w-5 h-5" />
                                        </a>
                                        <a href={person.socials.email} className="text-muted-foreground hover:text-primary transition-colors">
                                            <Mail className="w-5 h-5" />
                                        </a>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                    <p className="text-center mt-12 text-muted-foreground max-w-2xl mx-auto"
                        dangerouslySetInnerHTML={{ __html: t.raw('team.descriptionHtml') }}
                    />
                </motion.section>

                <Pricing />

                {/* FAQ Section */}
                <motion.section
                    className="py-16 sm:py-24"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-2xl sm:text-3xl font-light text-center mb-12 text-muted-foreground">
                        {t('faq.title')}
                    </h2>
                    <div className="max-w-3xl mx-auto">
                        <div className="space-y-4">
                            {[
                                { q: t('faq.questions.0.q'), a: t('faq.questions.0.a') },
                                { q: t('faq.questions.1.q'), a: t('faq.questions.1.a') },
                                { q: t('faq.questions.2.q'), a: t('faq.questions.2.a') },
                                { q: t('faq.questions.3.q'), a: t('faq.questions.3.a') },
                                { q: t('faq.questions.4.q'), a: t('faq.questions.4.a') },
                            ].map((faq, index) => (
                                <FAQItem key={index} q={faq.q} a={faq.a} />
                            ))}
                        </div>
                    </div>
                </motion.section>
            </div>
            <motion.section
                className="py-12 sm:py-16 md:py-24 bg-primary text-primary-foreground w-screen relative left-[50%] right-[50%] ml-[-50vw] mr-[-50vw] overflow-hidden"
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                viewport={{ once: true }}
            >
                {/* Floating Paths Background */}
                <div className="absolute inset-0">
                    <FloatingPathsBackground className="text-white" />
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-light text-center mb-6 sm:mb-8 text-primary-foreground">
                        Ας φτιάξουμε το μέλλον της αυτοδιοίκησης μαζί
                    </h2>
                    <p className="text-center text-sm sm:text-base md:text-lg lg:text-xl mb-6 sm:mb-8 text-primary-foreground/90">
                        Δώστε στους δημότες σας την πρώτη πλατφόρμα ΑΙ για την αυτοδιοίκηση.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 max-w-md sm:max-w-none mx-auto">
                        <Button
                            size="default"
                            variant="secondary"
                            onClick={() => setIsContactFormOpen(true)}
                            className="bg-white/90 hover:bg-white text-primary hover:text-primary/90 transition-colors duration-300 text-sm sm:text-base px-4 sm:px-6 py-3 sm:py-4"
                        >
                            <CalendarClock className="mr-2 h-4 w-4" />
                            <span className="hidden xs:inline">Επικοινωνήστε μαζί μας</span>
                            <span className="xs:hidden">Επικοινωνία</span>
                        </Button>
                        <a
                            href="tel:+302111980212"
                            className="inline-flex items-center justify-center no-underline"
                        >
                            <Button
                                size="default"
                                variant="secondary"
                                className="bg-white/90 hover:bg-white text-primary hover:text-primary/90 transition-colors duration-300 text-sm sm:text-base px-4 sm:px-6 py-3 sm:py-4 w-full"
                            >
                                <PhoneCall className="mr-2 h-4 w-4" />
                                +30 2111980212
                            </Button>
                        </a>
                    </div>
                </div>
            </motion.section>

            {/* Contact Form Popup */}
            <ContactFormPopup isOpen={isContactFormOpen} onClose={() => setIsContactFormOpen(false)} />
        </div>
    );
}

function FAQItem({ q, a }: { q: string, a: string }) {
    return (
        <details className="group border-b pb-4">
            <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-lg font-medium text-secondary-foreground">
                {q}
                <ChevronDown className="h-5 w-5 transition-transform duration-300 group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-muted-foreground">
                {a}
            </p>
        </details>
    )
}

function FeatureCard({ icon, title, description, badge }: { icon: React.ReactElement, title: string, description: string, badge?: React.ReactNode }) {
    const cardContent = (
        <Card className={`h-full flex flex-col ${badge ? 'border-none' : ''}`}>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-sm sm:text-base md:text-lg">
                    <div className="flex-shrink-0">
                        {React.cloneElement(icon, { className: "h-6 w-6 mr-2" })}
                    </div>
                    <span>{title}</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow pt-0">
                <p className="text-xs sm:text-sm md:text-base text-muted-foreground leading-relaxed">{description}</p>
            </CardContent>
            <CardFooter className="mt-auto flex justify-end pt-2">
                {badge}
            </CardFooter>
        </Card>
    );

    if (badge) {
        return (
            <ShineBorder
                className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden border bg-background md:shadow-xl"
                color={["#A07CFE", "#FE8FB5", "#FFBE7B"]}
            >
                {cardContent}
            </ShineBorder>
        );
    } else {
        return cardContent;
    }
}