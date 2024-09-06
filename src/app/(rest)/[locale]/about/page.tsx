'use client'

import { useTranslations } from 'next-intl'
import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion'
import { PhoneCall, HelpCircle, Search, Database, Mic, FileText, LetterText, BotMessageSquare, Sparkles, Github, Globe, Zap, Clock, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { useRef, useEffect } from 'react'
import React from 'react'

export default function AboutPage() {
    const t = useTranslations('AboutPage')
    const { scrollYProgress } = useScroll()
    const scaleX = useSpring(scrollYProgress, {
        stiffness: 100,
        damping: 30,
        restDelta: 0.001
    })

    const heroRef = useRef(null)
    const isHeroInView = useInView(heroRef, { once: true })

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.history.scrollRestoration = 'manual'
        }
    }, [])

    return (
        <div className="relative">
            <motion.div
                className="fixed top-0 left-0 right-0 h-1 bg-primary z-50 origin-left"
                style={{ scaleX }}
            />
            <div className="container mx-auto px-4 py-8">
                {/* Hero Section */}
                <motion.section
                    ref={heroRef}
                    className="relative text-center py-20 min-h-screen flex flex-col justify-center items-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                >
                    <motion.h1
                        className="text-4xl md:text-6xl font-bold mb-6 overflow-hidden"
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        {t('hero.title').split('').map((char, index) => (
                            <motion.span
                                key={`${char}-${index}`}
                                initial={{ opacity: 0, y: 50 }}
                                animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                                transition={{ duration: 0.5, delay: index * 0.05 }}
                                className="inline-block"
                            >
                                {char}
                            </motion.span>
                        ))}
                    </motion.h1>
                    <motion.p
                        className="text-xl md:text-2xl mb-8"
                        initial={{ y: 20, opacity: 0 }}
                        animate={isHeroInView ? { y: 0, opacity: 1 } : {}}
                        transition={{ delay: 0.5, duration: 0.8 }}
                    >
                        {t('hero.subtitle')}
                    </motion.p>
                    <motion.div
                        className="flex justify-center space-x-4"
                        initial={{ y: 20, opacity: 0 }}
                        animate={isHeroInView ? { y: 0, opacity: 1 } : {}}
                        transition={{ delay: 0.7, duration: 0.8 }}
                    >
                        <Button size="lg">{t('hero.getStarted')}</Button>
                        <Button size="lg" variant="outline">
                            <PhoneCall className="mr-2 h-4 w-4" />
                            {t('hero.scheduleCall')}
                        </Button>
                    </motion.div>
                    <motion.div
                        className="absolute bottom-10 left-1/2 transform -translate-x-1/2"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1, duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
                    >
                        <ChevronDown className="h-8 w-8 text-primary" />
                        <span className="sr-only">Scroll down for more content</span>
                    </motion.div>
                </motion.section>

                {/* Why OpenCouncil Section */}
                <motion.section
                    className="py-16"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-3xl font-bold text-center mb-12">{t('features.title')}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            { icon: HelpCircle, title: 'enhancedAccessibility' },
                            { icon: Search, title: 'empowerCouncilMembers' },
                            { icon: Database, title: 'buildValuableAsset' }
                        ].map((feature, index) => (
                            <motion.div
                                key={feature.title}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.2, duration: 0.8 }}
                                viewport={{ once: true }}
                            >
                                <Card className="h-full">
                                    <CardHeader>
                                        <CardTitle className="flex items-center">
                                            <feature.icon className="h-6 w-6 mr-2 text-primary" />
                                            <span>{t(`features.${feature.title}.title`)}</span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p>{t(`features.${feature.title}.description`)}</p>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                {/* Feature Showcase */}
                <motion.section
                    className="py-16"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-3xl font-bold text-center mb-12">{t('features.title')}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {[
                            { icon: Mic, title: 'speakerRecognition' },
                            { icon: FileText, title: 'accurateTranscriptions' },
                            { icon: LetterText, title: 'summarization' },
                            { icon: BotMessageSquare, title: 'aiChatAssistant' },
                            { icon: Sparkles, title: 'highlights' },
                            { icon: Github, title: 'openSource' },
                            { icon: Database, title: 'openData' },
                            { icon: Globe, title: 'multilingual' },
                            { icon: Zap, title: 'immediateIntegration' }
                        ].map((feature, index) => (
                            <motion.div
                                key={feature.title}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1, duration: 0.5 }}
                                viewport={{ once: true }}
                            >
                                <FeatureCard
                                    icon={<feature.icon className="h-10 w-10 text-primary" />}
                                    title={t(`features.${feature.title}.title`)}
                                    description={t(`features.${feature.title}.description`)}
                                />
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                {/* Pricing Section */}
                <motion.section
                    className="py-16 bg-muted rounded-lg"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-3xl font-bold text-center mb-12">{t('pricing.title')}</h2>
                    <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
                        {t('pricing.description')}
                    </p>
                    <div className="max-w-3xl m-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                        {['freeTrial', 'paid'].map((plan, index) => (
                            <motion.div
                                key={plan}
                                initial={{ opacity: 0, x: index === 0 ? -50 : 50 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.2, duration: 0.8 }}
                                viewport={{ once: true }}
                            >
                                <Card className="mb-8 md:mb-0 flex flex-col h-full">
                                    <CardHeader>
                                        <CardTitle className="text-2xl font-bold text-center">
                                            {t(`pricing.${plan}.title`)}
                                        </CardTitle>
                                        <p className="text-center text-muted-foreground">
                                            {t(`pricing.${plan}.subtitle`)}
                                        </p>
                                    </CardHeader>
                                    <CardContent className="flex-grow">
                                        <ul className="space-y-2">
                                            {['unlimitedDuration', 'fullAccess', 'noPayment', 'dedicatedSupport'].map((feature) => (
                                                <li key={feature} className="flex items-start">
                                                    <Clock className="h-5 w-5 mr-2 text-primary flex-shrink-0 mt-1" />
                                                    <span>{t(`pricing.${plan}.features.${feature}`)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                    <CardFooter>
                                        <Button className="w-full">{t(`pricing.${plan}.cta`)}</Button>
                                    </CardFooter>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                <motion.section
                    className="py-16"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <div className="container mx-auto px-4">
                        <h2 className="text-3xl font-bold text-center mb-8">{t('about.title')}</h2>
                        <p className="text-center text-lg mb-8 text-muted-foreground">
                            {t('about.description')}
                        </p>
                    </div>
                </motion.section>
            </div>
        </div>
    )
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ReactElement, title: string, description: string }) {
    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="flex items-center">
                    {React.cloneElement(Icon, { className: "h-6 w-6 mr-2" })}
                    <span>{title}</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">{description}</p>
            </CardContent>
        </Card>
    )
}