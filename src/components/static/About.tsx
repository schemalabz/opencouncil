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
        name: "Μαρία Καψιτίδου",
        image: "/people/maria.jpg",
        socials: {
            linkedin: "https://www.linkedin.com/in/maria-kapsitidou/",
            email: "mailto:maria@schemalabs.gr"
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
            className="relative py-16 sm:py-24 flex flex-col justify-center items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
        >
            <div className="flex flex-col items-center justify-center space-y-6">
                <h1 className="text-3xl sm:text-4xl md:text-6xl font-light tracking-tight text-center">
                    Κάνουμε τους δημότες
                    <motion.div
                        className="font-medium mt-2 md:mt-4 relative"
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
                    για το δήμο τους
                </h1>
                <motion.p
                    className="text-lg sm:text-xl md:text-2xl text-muted-foreground max-w-3xl text-center leading-relaxed"
                    initial={{ y: 20, opacity: 0 }}
                    animate={isHeroInView ? { y: 0, opacity: 1 } : {}}
                    transition={{ delay: 0.7, duration: 0.8 }}
                >
                    Η πρώτη ΑΙ πλατφόρμα συμμετοχικότητας για την αυτοδιοίκηση
                </motion.p>
                <motion.div
                    className="flex flex-col sm:flex-row justify-center gap-4"
                    initial={{ y: 20, opacity: 0 }}
                    animate={isHeroInView ? { y: 0, opacity: 1 } : {}}
                    transition={{ delay: 0.9, duration: 0.8 }}
                >
                    <Button
                        size="lg"
                        className="relative group text-base sm:text-lg px-8 py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 bg-primary hover:bg-primary/90"
                        onClick={() => setIsContactFormOpen(true)}
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            <CalendarClock className="h-4 w-4" />
                            Επικοινωνήστε μαζί μας
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
                        className="inline-flex items-center justify-center no-underline"
                    >
                        <Button
                            size="lg"
                            variant="outline"
                            className="text-base sm:text-lg px-8 py-6 rounded-xl hover:bg-primary/5 transition-colors duration-300"
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
                    className="py-16 sm:py-24"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-2xl sm:text-3xl font-light text-center mb-12 text-muted-foreground">
                        Χτίζουμε το μέλλον των δημοτικών συμβουλίων
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                        {[
                            { icon: Eye, title: 'Tο έργο σας, ορατό', description: 'Κάντε τις συνεδριάσεις του δημοτικού συμβουλίου κατανοητές και προσβάσιμες στους δημότες σας. Εξασφαλίστε μεγαλύτερη διαφάνεια, και τοποθετήστε το δήμο σας στην πρωτοπορία της έξυπνης διακυβέρνησης.' },
                            { icon: DatabaseIcon, title: 'Ένα νέο δημόσιο αγαθό', description: 'Δημιουργήστε μια πλούσια, αναζητήσιμη βάση δεδομένων των δημοκρατικών διαδικασιών του συμβουλίου, που ανήκει σε όλους.' },
                            { icon: Building, title: 'Αποτελεσματική διακυβέρνηση', description: 'Εξοπλίστε το δήμο σας με ισχυρά εργαλεία για την αποτελεσματικότερη χάραξη πολιτικών. Οι προηγμένες λειτουργίες αναζήτησης και οργάνωσης επιτρέπουν γρήγορη πρόσβαση σε προηγούμενες συζητήσεις και αποφάσεις.' },
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
                                        <CardTitle className="flex items-center gap-3 text-lg sm:text-xl font-normal">
                                            <feature.icon className="h-5 w-5 text-primary" />
                                            <span>{feature.title}</span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
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
                    className="text-center py-8 sm:py-16"
                >
                    <Button
                        size="lg"
                        className="relative group text-base sm:text-lg px-8 py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 bg-primary hover:bg-primary/90"
                        asChild
                    >
                        <Link href="/athens">
                            <span className="relative z-10 flex items-center gap-2">
                                <Building2 className="h-5 w-5" />
                                Δείτε το OpenCouncil για το Δήμο Αθηναίων
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
                    className="py-16 sm:py-24"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-2xl sm:text-3xl font-light text-center mb-12 text-muted-foreground">
                        Τι κάνει το OpenCouncil
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                        {[
                            { icon: Mic, title: 'Απομαγνητοφώνηση', description: 'Αυτόματη, κατά λέξη απομαγνητοφώνηση όλων των διαδικασιών του συμβουλίου, και αυτόματη αναγνώριση ομιλιτή.' },
                            { icon: LetterText, title: 'Περίληψη', description: 'Αυτόματη δημιουργία συνοπτικών περιλήψεων κάθε τοποθέτησης στο συμβούλιο.' },
                            { icon: SearchCheck, title: 'Αναζήτηση', description: 'Αναζήτηση σε όλα όσα έχουν ειπωθεί στα δημοτικά συμβούλια.' },
                            { icon: Sparkles, title: 'Highlights', description: 'Αυτόματη δημιουργία ολιγόλεπτων βίντεο με τα πιό σημαντικά μέρη κάθε συνεδρίασης.' },
                            { icon: BotMessageSquare, title: 'Βοηθός συνομιλίας AI', description: 'Κάντε ερωτήσεις σχετικά με τις συνεδριάσεις του συμβουλίου και λάβετε απαντήσεις από τον βοηθό συνομιλίας AI.', releaseDate: 'Απρίλιος 2025' },
                            { icon: Github, title: 'Ανοιχτός κώδικας', description: 'Διαφανής ανάπτυξη, συνεχής βελτίωση. Ελαστική άδεια GPL v3 που επιτρέπει την εμπορική χρήση.' },
                            { icon: Database, title: 'Ανοιχτά Δεδομένα', description: 'Όλα τα δεδομένα, διαθέσιμα δημόσια μέσω ενός ανοιχτού API χωρίς αυθεντικοποίηση.' },
                            { icon: Globe, title: 'Πολύγλωσσο', description: 'Υποστήριξη πολλαπλών γλωσσών για την εξυπηρέτηση πολυπολιτισμικών πόλεων.', releaseDate: 'Μάιος 2025' },
                            { icon: Zap, title: 'Άμεση Ενσωμάτωση', description: 'Συνδέστε το OpenCouncil στο δήμο σας σε λίγες ώρες, όχι μήνες.' },
                            { icon: Scroll, title: 'Σύνδεση με την ημερήσια διάταξη', description: 'Αυτόματη αναγνώριση θεμάτων από την απομαγνητοφώνηση, και σύνδεση τους με την ημερήσια διάταξη της συνεδρίασης' },
                            { icon: Mail, title: 'Προσωποποιημένα μηνύματα', description: 'Ενημερώστε τους πολίτες για τα θέματα του δημοτικού συμβουλίου που τους αφορούν, με φυσικό τρόπο, μέσα από το WhatsApp και το Viber', releaseDate: 'Απρίλιος 2025' },
                            { icon: Vote, title: 'Διαβούλευση στα social', description: 'Κάντε γρήγορες διαβουλεύσεις για τα θέματα του δημοτικού συμβουλίου, στο WhatsApp, στο Viber και στα Social', releaseDate: 'Μάιος 2025' }
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
                                    title={feature.title}
                                    description={feature.description}
                                    badge={feature.releaseDate ? (
                                        <AnimatedGradientText>
                                            <CalendarClock className="h-4 w-4 mr-2" /> {feature.releaseDate}
                                        </AnimatedGradientText>
                                    ) : null}
                                />
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                {/* Pricing Section */}
                <motion.section
                    className="py-16 sm:py-24"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <Pricing />
                </motion.section>

                <motion.section
                    className="py-16 sm:py-24 relative"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <ProductRoadmap />
                </motion.section>
                <motion.section
                    className="py-16 sm:py-24"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-2xl sm:text-3xl font-light text-center mb-8 text-muted-foreground">
                        Ποιοί είμαστε
                    </h2>
                    <p className="text-center text-lg sm:text-xl mb-8 text-muted-foreground">
                        Είμαστε ομάδα τριών ατόμων που δουλεύουμε καθημερινά στην εφαρμογή των νέων τεχνολογιών
                        στην αυτοδιοίκηση. Η OpenCouncil είναι ΙΚΕ, που ανήκει εξ&apos; ολοκλήρου στη <Link href="https://schemalabs.gr" className="underline" target="_blank" rel="noopener noreferrer">Schema Labs</Link>, μια ελληνική μη-κερδοσκοπική εταιρεία που αναπτύσσει τεχνολογία για τους δημοκρατικούς θεσμούς.
                    </p>

                    <div className="flex justify-center gap-12">
                        {people.map((person, index) => (
                            <div key={index} className="flex flex-col items-center">
                                <div className="w-24 h-24 mb-4 overflow-hidden rounded-full">
                                    <Image
                                        src={person.image}
                                        alt={person.name}
                                        width={96}
                                        height={96}
                                        className="w-full h-full object-cover filter grayscale hover:grayscale-0 transition-all duration-300"
                                    />
                                </div>
                                <h3 className="text-lg sm:text-xl font-medium text-center">{person.name}</h3>
                                <div className="flex gap-4">
                                    {person.socials.twitter && (
                                        <a href={person.socials.twitter} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-primary transition-colors">
                                            <Twitter className="w-5 h-5" />
                                        </a>
                                    )}
                                    {person.socials.linkedin && (
                                        <a href={person.socials.linkedin} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-primary transition-colors">
                                            <Linkedin className="w-5 h-5" />
                                        </a>
                                    )}
                                    {person.socials.email && (
                                        <a href={person.socials.email} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-primary transition-colors">
                                            <Mail className="w-5 h-5" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.section>


            </div >
            <motion.section
                className="py-16 sm:py-24 bg-primary text-primary-foreground w-screen relative left-[50%] right-[50%] ml-[-50vw] mr-[-50vw] overflow-hidden"
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
                    <h2 className="text-2xl sm:text-3xl font-light text-center mb-8 text-primary-foreground">
                        Ας φτιάξουμε το μέλλον της αυτοδιοίκησης μαζί
                    </h2>
                    <p className="text-center text-lg sm:text-xl mb-8 text-primary-foreground/90">
                        Δώστε στους δημότες σας την πρώτη πλατφόρμα ΑΙ για την αυτοδιοίκηση.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Button
                            size="lg"
                            variant="secondary"
                            onClick={() => setIsContactFormOpen(true)}
                            className="bg-white/90 hover:bg-white text-primary hover:text-primary/90 transition-colors duration-300"
                        >
                            <CalendarClock className="mr-2 h-4 w-4" />
                            Επικοινωνήστε μαζί μας
                        </Button>
                        <a
                            href="tel:+302111980212"
                            className="inline-flex items-center justify-center no-underline"
                        >
                            <Button
                                size="lg"
                                variant="secondary"
                                className="bg-white/90 hover:bg-white text-primary hover:text-primary/90 transition-colors duration-300"
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
function FeatureCard({ icon: Icon, title, description, badge }: { icon: React.ReactElement, title: string, description: string, badge?: React.ReactNode }) {
    const cardContent = (
        <Card className={`h-full flex flex-col ${badge ? 'border-none' : ''}`}>
            <CardHeader>
                <CardTitle className="flex items-center">
                    <div className="flex-shrink-0">
                        {React.cloneElement(Icon, { className: "h-6 w-6 mr-2" })}
                    </div>
                    <span>{title}</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow">
                <p className="text-muted-foreground">{description}</p>
            </CardContent>
            <CardFooter className="mt-auto flex justify-end">
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