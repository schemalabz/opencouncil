'use client'
import { motion, useScroll, useSpring, useTransform, useInView, useAnimation } from 'framer-motion'
import { PhoneCall, Megaphone, HelpCircle, Search, Database, Mic, FileText, LetterText, BotMessageSquare, Sparkles, Github, Globe, Zap, Clock, ChevronDown, Eye, Users, DatabaseIcon, Building, SearchCheck, Mic2, CalendarClock, Phone, Building2, Vote, Scroll, Mail, Twitter, Linkedin } from 'lucide-react'
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
import { FloatingPathsBackground } from '@/components/ui/floating-paths'
import Marquee from '@/components/ui/marquee'

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
    },
    {
        name: "Ελίζα Γκιμιτζούδη",
        image: "/people/eliza.jpeg",
        socials: {
            linkedin: "https://www.linkedin.com/in/egkimitzoudi/",
            email: "mailto:eliza@schemalabs.gr"
        }
    },
    {
        name: "Θάνος Παπαδογιάννης",
        image: "/people/thanos.png",
        socials: {
            linkedin: "https://www.linkedin.com/in/athanasios-papadogiannis-099537195/",
            email: "mailto:thanos@schemalabs.gr"
        }
    }
]
function Hero({ setIsContactFormOpen }: { setIsContactFormOpen: (open: boolean) => void }) {
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
            <div className="flex flex-col items-center justify-center space-y-4 sm:space-y-6">
                <motion.p
                    className="text-xs sm:text-sm md:text-base uppercase tracking-wide text-center px-4 text-muted-foreground"
                    style={{ fontFamily: "'Roboto Mono', monospace" }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.6 }}
                >
                    φερτε το opencouncil στον δημο σας
                </motion.p>
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-light tracking-tight text-center px-4">
                    Κάνουμε τους δημότες
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
                            να νοιάζονται
                        </motion.span>
                    </motion.div>
                    για την αυτοδιοίκηση
                </h1>
                <motion.p
                    className="text-base sm:text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-3xl text-center leading-relaxed px-4"
                    initial={{ y: 20, opacity: 0 }}
                    animate={isHeroInView ? { y: 0, opacity: 1 } : {}}
                    transition={{ delay: 0.7, duration: 0.8 }}
                >
                    Η πρώτη ΑΙ πλατφόρμα συμμετοχικότητας για την αυτοδιοίκηση
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
                            <span className="hidden xs:inline">Επικοινωνήστε μαζί μας</span>
                            <span className="xs:hidden">Επικοινωνία</span>
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

interface AboutPageProps {
    citiesWithLogos?: Array<{ id: string; logoImage: string; name_municipality: string }>
}

export default function AboutPage({ citiesWithLogos }: AboutPageProps) {
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

                {/* Supported Municipalities Scroller */}
                {citiesWithLogos && citiesWithLogos.length > 0 && (
                    <motion.section
                        className="py-4 sm:py-5"
                        initial={{ opacity: 0, y: 50 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                        viewport={{ once: true }}
                    >
                        <div className="px-4">
                            <div
                                className="text-center mb-3 uppercase tracking-wide font-mono text-xs"
                                style={{ fontFamily: "'Roboto Mono', monospace" }}
                            >
                                ΣΥΝΕΡΓΑΖΟΜΕΝΟΙ ΔΗΜΟΙ
                            </div>
                            <div
                                className="relative w-full overflow-hidden"
                                style={{
                                    maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
                                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
                                }}
                            >
                                {/* Fade using mask-image for true transparency over any background */}

                                <Marquee
                                    className="[--duration:30s] [--gap:2rem] sm:[--gap:2.5rem] md:[--gap:3rem] p-0 justify-center"
                                    reverse={false}
                                    pauseOnHover={false}
                                    repeat={5}
                                >
                                    {citiesWithLogos.map((city) => (
                                        <div
                                            key={city.id}
                                            className="flex-shrink-0 flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 transition-opacity hover:opacity-80"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={city.logoImage}
                                                alt={city.name_municipality}
                                                className="w-full h-full object-contain"
                                            />
                                        </div>
                                    ))}
                                </Marquee>
                            </div>
                        </div>
                    </motion.section>
                )}

                {/* Why OpenCouncil Section */}
                <motion.section
                    className="py-12 sm:py-16 md:py-24"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-light text-center mb-8 sm:mb-12 text-muted-foreground px-4">
                        Χτίζουμε το μέλλον των δημοτικών συμβουλίων
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
                        {[
                            { icon: Scroll, title: 'Γρήγορα, αναζητήσιμες απομαγνητοφωνήσεις', description: 'Ακριβείς, ψηφιακές απομαγνητοφωνήσεις των συλλογικών οργάνων του δήμου (Δημοτικά Συμβούλια, Επιτροπές, Κοινότητες) διαθέσιμες σε όλους σε ώρες, όχι σε μέρες και εβδομάδες.' },
                            { icon: Eye, title: 'Tο έργο σας, ορατό', description: 'Κάντε τις συνεδριάσεις του δημοτικού συμβουλίου κατανοητές και προσβάσιμες στους δημότες σας. Εξασφαλίστε μεγαλύτερη διαφάνεια, και τοποθετήστε το δήμο σας στην πρωτοπορία της έξυπνης διακυβέρνησης.' },
                            { icon: Megaphone, title: 'Συμμετοχικότητα στο σήμερα', description: 'Φέρτε τα δημοτικά συμβούλια του δήμου σας εκεί που οι πολίτες ήδη περνάνε το χρόνο τους: στο WhatsApp και στα Social Media. Επιτρέψτε τους να ενημερωθούν για τα θέματα της γειτονιάς τους άμεσα και απλά.' },
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
                        <Link href="/chania">
                            <span className="relative z-10 flex items-center gap-2">
                                <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
                                <span className="hidden sm:inline">Δείτε το OpenCouncil για το Δήμο Χανίων</span>
                                <span className="sm:hidden">Δήμος Χανίων</span>
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
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-light text-center mb-8 sm:mb-12 text-muted-foreground px-4">
                        Τι κάνει το OpenCouncil
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
                        {[
                            { icon: Mic, title: 'Απομαγνητοφώνηση', description: 'Αυτόματη, κατά λέξη απομαγνητοφώνηση όλων των διαδικασιών του συμβουλίου, και αυτόματη αναγνώριση ομιλιτή.', demo: { text: "Δείτε ένα παράδειγμα", link: "/chania/jun25_2025/transcript" } },
                            { icon: LetterText, title: 'Περίληψη', description: 'Αυτόματη δημιουργία συνοπτικών περιλήψεων κάθε τοποθέτησης στο συμβούλιο.', demo: { text: "Δείτε ένα παράδειγμα", link: "/chania/jun25_2025/subjects/cmcck9ojq010jrmgxp76tqjg1" } },
                            { icon: SearchCheck, title: 'Αναζήτηση', description: 'Αναζήτηση σε όλα όσα έχουν ειπωθεί στα δημοτικά συμβούλια.', demo: { text: "Δοκιμάστε το", link: "/search" } },
                            { icon: Sparkles, title: 'Highlights', description: 'Αυτόματη δημιουργία ολιγόλεπτων βίντεο με τα πιό σημαντικά μέρη κάθε συνεδρίασης.' },
                            { icon: BotMessageSquare, title: 'Βοηθός συνομιλίας AI', description: 'Κάντε ερωτήσεις σχετικά με τις συνεδριάσεις του συμβουλίου και λάβετε απαντήσεις από τον βοηθό συνομιλίας AI.', demo: { text: "Δοκιμάστε το", link: "/chat" } },
                            { icon: Github, title: 'Ανοιχτός κώδικας', description: 'Διαφανής ανάπτυξη, συνεχής βελτίωση. Ελαστική άδεια GPL v3 που επιτρέπει την εμπορική χρήση.', demo: { text: "Διαβάστε περισσότερα", link: "https://schemalabs.substack.com/p/opensource" } },
                            { icon: Database, title: 'Ανοιχτά Δεδομένα', description: 'Όλα τα δεδομένα, διαθέσιμα δημόσια μέσω ενός ανοιχτού API χωρίς αυθεντικοποίηση.', demo: { text: "Δείτε τo API", link: "/docs" } },
                            { icon: Globe, title: 'Πολύγλωσσο', description: 'Υποστήριξη πολλαπλών γλωσσών για την εξυπηρέτηση πολυπολιτισμικών πόλεων.', releaseDate: 'Άνοιξη 2025' },
                            { icon: Zap, title: 'Άμεση Ενσωμάτωση', description: 'Συνδέστε το OpenCouncil στο δήμο σας σε λίγες ώρες, όχι μήνες.' },
                            { icon: Scroll, title: 'Σύνδεση με την ημερήσια διάταξη', description: 'Σύνδεση των θεμάτων που συζητούνται στις συνεδριάσεις με την ημερήσια διάταξη', demo: { text: "Δείτε ένα παράδειγμα", link: "/chania/jun25_2025/subjects/" } },
                            { icon: Mail, title: 'Προσωποποιημένα μηνύματα', description: 'Ενημερώστε τους πολίτες για τα θέματα του δημοτικού συμβουλίου που τους αφορούν, με φυσικό τρόπο, μέσα από το WhatsApp και το Viber' },
                            { icon: Vote, title: 'Διαβούλευση στα social', description: 'Κάντε γρήγορες διαβουλεύσεις για τα θέματα του δημοτικού συμβουλίου, στο WhatsApp, στο Viber και στα Social', releaseDate: 'Άνοιξη 2025' }
                        ].map((feature, index) => (
                            <motion.div
                                key={feature.title}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1, duration: 0.5 }}
                                viewport={{ once: true }}
                            >


                                <FeatureCard
                                    icon={<feature.icon className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />}
                                    title={feature.title}
                                    description={feature.description}
                                    badge={feature.releaseDate ? (
                                        <AnimatedGradientText>
                                            <CalendarClock className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                                            <span className="text-xs sm:text-sm">{feature.releaseDate}</span>
                                        </AnimatedGradientText>
                                    ) : null}
                                    demoButton={feature.demo ? (
                                        <Link href={feature.demo.link} className="inline-block">
                                            <AnimatedGradientText className="cursor-pointer hover:scale-105 transition-all duration-200 hover:shadow-md">
                                                <span className="text-xs sm:text-sm font-medium">
                                                    {feature.demo.text}
                                                </span>
                                            </AnimatedGradientText>
                                        </Link>
                                    ) : null}
                                />
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                {/* Pricing Section */}
                <motion.section
                    className="py-12 sm:py-16 md:py-24"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <Pricing />
                </motion.section>



                <motion.section
                    className="py-12 sm:py-16 md:py-24 relative"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <ProductRoadmap />
                </motion.section>
                <motion.section
                    className="py-12 sm:py-16 md:py-24"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-light text-center mb-6 sm:mb-8 text-muted-foreground px-4">
                        Ποιοί είμαστε
                    </h2>
                    <p className="text-center text-sm sm:text-base md:text-lg lg:text-xl mb-6 sm:mb-8 text-muted-foreground px-4">
                        Είμαστε μια μικρή ομάδα που δουλεύουμε καθημερινά στην εφαρμογή των νέων τεχνολογιών
                        στην αυτοδιοίκηση. Η OpenCouncil είναι ΙΚΕ, που ανήκει εξ&apos; ολοκλήρου στη <Link href="https://schemalabs.gr" className="underline" target="_blank" rel="noopener noreferrer">Schema Labs</Link>, μια ελληνική μη-κερδοσκοπική εταιρεία που αναπτύσσει τεχνολογία για τους δημοκρατικούς θεσμούς.
                    </p>

                    <div className="flex flex-col sm:flex-row justify-center gap-8 sm:gap-12 px-4">
                        {people.map((person, index) => (
                            <div key={index} className="flex flex-col items-center">
                                <div className="w-20 h-20 sm:w-24 sm:h-24 mb-3 sm:mb-4 overflow-hidden rounded-full">
                                    <Image
                                        src={person.image}
                                        alt={person.name}
                                        width={96}
                                        height={96}
                                        className="w-full h-full object-cover filter grayscale hover:grayscale-0 transition-all duration-300"
                                    />
                                </div>
                                <h3 className="text-base sm:text-lg md:text-xl font-medium text-center mb-2">{person.name}</h3>
                                <div className="flex gap-3 sm:gap-4">
                                    {person.socials.twitter && (
                                        <a href={person.socials.twitter} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-primary transition-colors">
                                            <Twitter className="w-4 h-4 sm:w-5 sm:h-5" />
                                        </a>
                                    )}
                                    {person.socials.linkedin && (
                                        <a href={person.socials.linkedin} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-primary transition-colors">
                                            <Linkedin className="w-4 h-4 sm:w-5 sm:h-5" />
                                        </a>
                                    )}
                                    {person.socials.email && (
                                        <a href={person.socials.email} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-primary transition-colors">
                                            <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.section>


            </div >
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
            <ContactFormPopup
                isOpen={isContactFormOpen}
                onClose={() => setIsContactFormOpen(false)}
            />
        </div>
    );
}

function FeatureCard({ icon: Icon, title, description, badge, demoButton }: { icon: React.ReactElement, title: string, description: string, badge?: React.ReactNode, demoButton?: React.ReactNode }) {
    const hasBottomElement = badge || demoButton;

    return <Card className="h-full">
        <div className="h-full flex flex-col">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-sm sm:text-base md:text-lg">
                    <div className="flex-shrink-0">
                        {React.cloneElement(Icon, { className: "h-5 w-5 sm:h-6 sm:w-6 mr-2" })}
                    </div>
                    <span>{title}</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 pt-0 flex flex-col">
                <p className="text-xs sm:text-sm md:text-base text-muted-foreground leading-relaxed flex-1">
                    {description}
                </p>
                {hasBottomElement && (
                    <div className="mt-4 flex justify-center">
                        {badge && (
                            <div className="inline-flex">
                                {badge}
                            </div>
                        )}
                        {demoButton && (
                            <div className="inline-flex">
                                {demoButton}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </div>
    </Card>;
}