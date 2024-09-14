'use client'
import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion'
import { PhoneCall, HelpCircle, Search, Database, Mic, FileText, LetterText, BotMessageSquare, Sparkles, Github, Globe, Zap, Clock, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { useRef, useEffect } from 'react'
import React from 'react'
import ProductRoadmap from './ProductRoadmap'
import { useTranslations } from 'next-intl'

export default function AboutPage() {
    const t = useTranslations('about')
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
                    className="relative text-center py-10 h-[66vh] min-h-[500px] flex flex-col justify-center items-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                >
                    <div className="flex flex-col items-center justify-center h-full">
                        <h1 className="text-4xl md:text-6xl font-bold mb-6">
                            Ανοιχτή Αυτοδιοίκηση
                        </h1>
                        <motion.p
                            className="text-xl md:text-2xl mb-8"
                            initial={{ y: 20, opacity: 0 }}
                            animate={isHeroInView ? { y: 0, opacity: 1 } : {}}
                            transition={{ delay: 0.5, duration: 0.8 }}
                        >
                            Κάνουμε τις συνεδριάσεις του δημοτικού συμβουλίου προσβάσιμες σε όλους
                        </motion.p>
                        <motion.div
                            className="flex justify-center space-x-4"
                            initial={{ y: 20, opacity: 0 }}
                            animate={isHeroInView ? { y: 0, opacity: 1 } : {}}
                            transition={{ delay: 0.7, duration: 0.8 }}
                        >
                            <Button size="lg">Ξεκινήστε</Button>
                            <Button size="lg" variant="outline">
                                <PhoneCall className="mr-2 h-4 w-4" />
                                Προγραμματίστε μια κλήση
                            </Button>
                        </motion.div>
                    </div>
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
                    <h2 className="text-3xl font-bold text-center mb-12">Χαρακτηριστικά</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            { icon: HelpCircle, title: 'Βελτιωμένη Προσβασιμότητα', description: 'Κάντε τις συνεδριάσεις του δημοτικού συμβουλίου κατανοητές και προσβάσιμες σε όλους τους πολίτες, συμπεριλαμβανομένων των ατόμων με αναπηρίες. Η πλατφόρμα μας διασφαλίζει ότι η τοπική δημοκρατία είναι συμπεριληπτική, διαφανής και προσιτή σε κάθε μέλος της κοινότητας.' },
                            { icon: Search, title: 'Ενδυνάμωση των Μελών του Συμβουλίου', description: 'Εξοπλίστε τα μέλη του συμβουλίου σας με ισχυρά εργαλεία για να βελτιστοποιήσουν την εργασία τους. Οι προηγμένες λειτουργίες αναζήτησης και οργάνωσης επιτρέπουν γρήγορη πρόσβαση σε προηγούμενες συζητήσεις, αποφάσεις και σημαντικές πληροφορίες, ενισχύοντας την παραγωγικότητα και τη λήψη τεκμηριωμένων αποφάσεων.' },
                            { icon: Database, title: 'Δημιουργία Πολύτιμου Περιουσιακού Στοιχείου', description: 'Δημιουργήστε μια πλούσια, αναζητήσιμη βάση δεδομένων των διαδικασιών του συμβουλίου. Αυτό το ανοιχτό περιουσιακό στοιχείο δεδομένων όχι μόνο προωθεί τη διαφάνεια αλλά παρέχει επίσης ανεκτίμητες πληροφορίες για τη χάραξη πολιτικής, την έρευνα και τη συμμετοχή των πολιτών, τοποθετώντας την πόλη σας στην πρωτοπορία της έξυπνης διακυβέρνησης.' }
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
                            { icon: Mic, title: 'Αναγνώριση Ομιλητή', description: 'Ακριβής αναγνώριση και απόδοση των ομιλητών στις συνεδριάσεις του συμβουλίου.' },
                            { icon: FileText, title: 'Ακριβής Απομαγνητοφώνηση', description: 'Δημιουργία ακριβών, κατά λέξη απομαγνητοφωνήσεων όλων των διαδικασιών του συμβουλίου.' },
                            { icon: LetterText, title: 'Περίληψη', description: 'Αυτόματη δημιουργία συνοπτικών περιλήψεων των συνεδριάσεων του συμβουλίου.' },
                            { icon: BotMessageSquare, title: 'Βοηθός συνομιλίας AI', description: 'Κάντε ερωτήσεις σχετικά με τις συνεδριάσεις του συμβουλίου και λάβετε απαντήσεις από τον βοηθό συνομιλίας AI.' },
                            { icon: Sparkles, title: 'Επισημάνσεις', description: 'Παρακολουθήστε τα πιο σημαντικά μέρη κάθε συνεδρίασης, με επισημάνσεις που δημιουργούνται από AI ή χειροκίνητα.' },
                            { icon: Github, title: 'Ανοιχτός κώδικας', description: 'Διαφανής ανάπτυξη, συνεχής βελτίωση. Ελαστική άδεια που επιτρέπει την εμπορική χρήση.' },
                            { icon: Database, title: 'Ανοιχτά Δεδομένα', description: 'Όλα τα δεδομένα που παράγουμε είναι δημόσια και διαθέσιμα μέσω ενός ανοιχτού API χωρίς αυθεντικοποίηση.' },
                            { icon: Globe, title: 'Πολύγλωσσο', description: 'Υποστήριξη πολλαπλών γλωσσών για την εξυπηρέτηση πολυπολιτισμικών πόλεων. Όλες οι συνεδριάσεις μεταγράφονται στα Αγγλικά και τα Ελληνικά.' },
                            { icon: Zap, title: 'Άμεση Ενσωμάτωση', description: 'Συνδέστε το OpenCouncil στο δήμο σας σε λίγες ώρες, όχι μήνες.' }
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
                    <h2 className="text-3xl font-bold text-center mb-12">Τιμολόγηση</h2>
                    <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
                        Απλή και διαφανής τιμολόγηση για όλους τους δήμους
                    </p>
                    <div className="max-w-3xl m-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                        {[
                            {
                                title: 'Δωρεάν Δοκιμή',
                                subtitle: 'Για δήμους που θέλουν να δοκιμάσουν το OpenCouncil',
                                features: [
                                    'Απεριόριστη διάρκεια',
                                    'Πλήρης πρόσβαση σε όλες τις λειτουργίες',
                                    'Χωρίς χρέωση',
                                    'Υποστήριξη μέσω email'
                                ],
                                cta: 'Ξεκινήστε Δωρεάν'
                            },
                            {
                                title: 'Επί Πληρωμή',
                                subtitle: 'Για δήμους που θέλουν να χρησιμοποιήσουν το OpenCouncil μακροπρόθεσμα',
                                features: [
                                    'Απεριόριστη διάρκεια',
                                    'Πλήρης πρόσβαση σε όλες τις λειτουργίες',
                                    'Προσαρμοσμένη τιμολόγηση βάσει του πληθυσμού του δήμου',
                                    'Αποκλειστική υποστήριξη'
                                ],
                                cta: 'Επικοινωνήστε μαζί μας'
                            }
                        ].map((plan, index) => (
                            <motion.div
                                key={plan.title}
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
                    className="py-16 relative"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <ProductRoadmap />
                </motion.section>


                <motion.section
                    className="py-16 bg-primary text-primary-foreground"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <div className="container mx-auto px-4">
                        <h2 className="text-3xl font-bold text-center mb-8">Ξεκινήστε σήμερα</h2>
                        <p className="text-center text-lg mb-8">
                            Ανακαλύψτε πώς η Ανοιχτή Αυτοδιοίκηση μπορεί να βελτιώσει τη διαφάνεια στην τοπική σας κοινότητα.
                        </p>
                        <div className="flex justify-center">
                            <Button size="lg" variant="secondary">
                                Δοκιμάστε το δωρεάν
                            </Button>
                        </div>
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