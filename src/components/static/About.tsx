'use client'
import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion'
import { PhoneCall, HelpCircle, Search, Database, Mic, FileText, LetterText, BotMessageSquare, Sparkles, Github, Globe, Zap, Clock, ChevronDown, Eye, Users, DatabaseIcon, Building, SearchCheck, Mic2, CalendarClock, Phone, Building2, Vote, Scroll, Mail } from 'lucide-react'
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
    const [isContactFormOpen, setIsContactFormOpen] = useState(false)

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
                    className="relative text-center py-10 h-[66vh] min-h-[500px] flex flex-col justify-center items-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                >
                    <div className="flex flex-col items-center justify-center h-full z-10 relative"> {/* Added z-10 and relative */}
                        <h1 className="text-4xl md:text-6xl font-bold mb-6">
                            Ανοιχτή Αυτοδιοίκηση
                        </h1>
                        <motion.p
                            className="text-xl md:text-2xl mb-8"
                            initial={{ y: 20, opacity: 0 }}
                            animate={isHeroInView ? { y: 0, opacity: 1 } : {}}
                            transition={{ delay: 0.5, duration: 0.8 }}
                        >
                            Κάνουμε τους δημότες να νοιάζονται για το δήμο τους
                        </motion.p>
                        <motion.div
                            className="flex flex-col md:flex-row justify-center space-y-4 md:space-y-0 md:space-x-4"
                            initial={{ y: 20, opacity: 0 }}
                            animate={isHeroInView ? { y: 0, opacity: 1 } : {}}
                            transition={{ delay: 0.7, duration: 0.8 }}
                        >
                            <Button size="lg" variant="outline" onClick={() => setIsContactFormOpen(true)}>
                                <CalendarClock className="mr-2 h-4 w-4" />
                                Προγραμματίστε μια κλήση
                            </Button>
                            <a
                                href="tel:+302111980212"
                                className="inline-flex items-center justify-center no-underline"
                            >
                                <Button size="lg" variant="outline">
                                    <PhoneCall className="mr-2 h-4 w-4" />
                                    +30 2111980212
                                </Button>
                            </a>
                        </motion.div>
                    </div>
                    <Particles
                        className="absolute inset-0 z-0"
                        quantity={200}
                        ease={80}
                        color="#000"
                        refresh
                    />
                    <motion.div
                        className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-10"
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
                    <h2 className="text-3xl font-bold text-center mb-12">Χτίζουμε το μέλλον των δημοτικών συμβουλίων</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
                                <Card className="h-full">
                                    <CardHeader>
                                        <CardTitle className="flex items-center">
                                            <feature.icon className="h-6 w-6 mr-2 text-primary" />
                                            <span>{feature.title}</span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p>{feature.description}</p>
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
                    className="text-center"
                >
                    <Button
                        size="lg"
                        className="bg-primary hover:bg-primary/90"
                        asChild
                    >
                        <a href="/athens">
                            <Building2 className="mr-2 h-5 w-5" />
                            Δείτε το OpenCouncil για το Δήμο Αθηναίων
                        </a>
                    </Button>
                </motion.div>

                {/* Feature Showcase */}
                <motion.section
                    className="py-16"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-3xl font-bold text-center mb-12">Χαρακτηριστικά</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {[
                            { icon: Mic, title: 'Απομαγνητοφώνηση', description: 'Αυτόματη, κατά λέξη απομαγνητοφώνηση όλων των διαδικασιών του συμβουλίου, και αυτόματη αναγνώριση ομιλιτή.' },
                            { icon: LetterText, title: 'Περίληψη', description: 'Αυτόματη δημιουργία συνοπτικών περιλήψεων κάθε τοποθέτησης στο συμβούλιο.' },
                            { icon: SearchCheck, title: 'Αναζήτηση', description: 'Αναζήτηση σε όλα όσα έχουν ειπωθεί στα δημοτικά συμβούλια.' },
                            { icon: Sparkles, title: 'Highlights', description: 'Αυτόματη δημιουργία ολιγόλεπτων βίντεο με τα πιό σημαντικά μέρη κάθε συνεδρίασης.' },
                            { icon: BotMessageSquare, title: 'Βοηθός συνομιλίας AI', description: 'Κάντε ερωτήσεις σχετικά με τις συνεδριάσεις του συμβουλίου και λάβετε απαντήσεις από τον βοηθό συνομιλίας AI.', releaseDate: 'Ιανουάριος 2025' },
                            { icon: Github, title: 'Ανοιχτός κώδικας', description: 'Διαφανής ανάπτυξη, συνεχής βελτίωση. Ελαστική άδεια GPL v3 που επιτρέπει την εμπορική χρήση.', releaseDate: 'Δεκέμβριος 2024' },
                            { icon: Database, title: 'Ανοιχτά Δεδομένα', description: 'Όλα τα δεδομένα, διαθέσιμα δημόσια μέσω ενός ανοιχτού API χωρίς αυθεντικοποίηση.' },
                            { icon: Globe, title: 'Πολύγλωσσο', description: 'Υποστήριξη πολλαπλών γλωσσών για την εξυπηρέτηση πολυπολιτισμικών πόλεων.', releaseDate: 'Φεβρουάριος 2025' },
                            { icon: Zap, title: 'Άμεση Ενσωμάτωση', description: 'Συνδέστε το OpenCouncil στο δήμο σας σε λίγες ώρες, όχι μήνες.' },
                            { icon: Scroll, title: 'Σύνδεση με την ημερήσια διάταξη', description: 'Αυτόματη αναγνώριση θεμάτων από την απομαγνητοφώνηση, και σύνδεση τους με την ημερήσια διάταξη της συνεδρίασης', releaseDate: 'Δεκέμβριος 2025' },
                            { icon: Mail, title: 'Προσωποποιημένα μηνύματα', description: 'Ενημερώστε τους πολίτες για τα θέματα του δημοτικού συμβουλίου που τους αφορούν, με φυσικό τρόπο, μέσα από το WhatsApp και το Viber', releaseDate: 'Δεκέμβριος 2025' },
                            { icon: Vote, title: 'Φυσική διαβούλευση', description: 'Κάντε μικρές διαβουλεύσεις για τα θέματα του δημοτικού συμβουλίου, στο WhatsApp, στο Viber και στα Social', releaseDate: 'Ιανουάριος 2025' }
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
                    className="py-16"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <Pricing />
                </motion.section>

                <motion.section
                    className="py-16 relative"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <ProductRoadmap />
                </motion.section>


            </div >
            <motion.section
                className="py-16 bg-primary text-primary-foreground w-screen relative left-[50%] right-[50%] ml-[-50vw] mr-[-50vw]"
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                viewport={{ once: true }}
            >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"> {/* Added relative and z-10 */}
                    <h2 className="text-3xl font-bold text-center mb-8">Ας φτιάξουμε το μέλλον της αυτοδιοίκησης μαζί</h2>
                    <p className="text-center text-lg mb-8">
                        Ελάτε να χτίσουμε τη πρώτη πλατφόρμα τεχνητής νοημοσύνης για τη τοπική αυτοδιοίκηση.
                    </p>
                    <div className="flex flex-col md:flex-row justify-center space-y-4 md:space-y-0 md:space-x-4">
                        <Button size="lg" variant="secondary" onClick={() => setIsContactFormOpen(true)}>
                            <CalendarClock className="mr-2 h-4 w-4" />
                            Προγραμματίστε μια κλήση
                        </Button>
                        <a
                            href="tel:+302111980212"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center no-underline"
                        >
                            <Button size="lg" variant="secondary">
                                <PhoneCall className="mr-2 h-4 w-4" />
                                +30 2111980212
                            </Button>
                        </a>
                    </div>
                </div>

                <Particles
                    className="absolute inset-0 z-0"
                    quantity={200}
                    ease={80}
                    color="#fff"
                    refresh
                />
            </motion.section>

            {/* Add the ContactFormPopup component */}
            <ContactFormPopup
                isOpen={isContactFormOpen}
                onClose={() => setIsContactFormOpen(false)}
            />
        </div >
    )
}
function FeatureCard({ icon: Icon, title, description, badge }: { icon: React.ReactElement, title: string, description: string, badge?: React.ReactNode }) {
    const cardContent = (
        <Card className={`h-full ${badge ? 'border-none' : ''}`}>
            <CardHeader>
                <CardTitle className="flex items-center">
                    {React.cloneElement(Icon, { className: "h-6 w-6 mr-2" })}
                    <span>{title}</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">{description}</p>
            </CardContent>
            <CardFooter className="flex justify-end">
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