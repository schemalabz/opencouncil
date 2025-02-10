'use client'

import { motion } from 'framer-motion'
import { Bot, Database, ExternalLink, Share2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WordRotator } from '@/components/ui/word-rotator'
import { Button } from '@/components/ui/button'
import { Link } from "@/i18n/routing";

export default function ExplainPage() {
    return (
        <div className="min-h-screen">
            <div className="container mx-auto px-2 sm:px-4">
                {/* Hero Section */}
                <motion.section
                    className="relative py-8 sm:py-16 flex flex-col justify-center items-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                >
                    <div className="flex flex-col items-center justify-center space-y-4 sm:space-y-6">
                        <h1 className="text-xl sm:text-2xl text-muted-foreground">
                            Η αυτοδιοίκηση λύνει καθημερινά προβλήματα.
                        </h1>
                        <div className="text-3xl sm:text-4xl md:text-6xl font-light my-6 sm:my-8 md:my-12">
                            <WordRotator words={['🛣️ Τους δρόμους μας', '🏘️ Τις γειτονιές μας', '🏫 Τα σχολεία μας', '🌳 Τα πάρκα μας', '🕒 Ωράρια κατασημάτων', '🚦 Κυκλοφοριακές ρυθμίσεις', '🧹 Καθαριότητα']} />
                        </div>
                        <motion.p
                            className="text-lg sm:text-xl text-muted-foreground max-w-3xl text-center leading-relaxed"
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.5, duration: 0.8 }}
                        >
                            Το OpenCouncil κάνει τις δημόσιες συνεδριάσεις της αυτοδιοίκησης απλές και πιο συμμετοχικές.
                        </motion.p>
                    </div>
                </motion.section>

                <motion.section
                    className="flex justify-center py-8 sm:py-16"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                >
                    <Button
                        asChild
                        size="lg"
                        className="relative group text-base sm:text-lg px-8 py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 bg-primary hover:bg-primary/90"
                    >
                        <Link href="/athens">
                            <span className="relative z-10">Εξερεύνησε τα δημοτικά συμβούλια της Αθήνας</span>
                            <motion.div
                                className="absolute inset-0 rounded-xl bg-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                whileHover={{
                                    boxShadow: "0 0 30px rgba(var(--primary), 0.5)"
                                }}
                            />
                        </Link>
                    </Button>
                </motion.section>

                {/* Features Section */}
                <motion.section
                    className="py-8 sm:py-16"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-xl sm:text-2xl text-center mb-8 text-muted-foreground">
                        Η τεχνητή νοημοσύνη του OpenCouncil...
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                        {[
                            {
                                description: 'Διαβάζει την ημερήσια διάταξη',
                                emoji: '📜'
                            },
                            {
                                description: 'Βλέπει τη συνεδρίαση',
                                emoji: '📹'
                            },
                            {
                                description: 'Αναγνωρίζει τους ομιλητές',
                                emoji: '🗣️'
                            },
                            {
                                description: 'Καταγράφει τα πρακτικά',
                                emoji: '📚'
                            },
                            {
                                description: 'Εντοπίζει θέματα και τοποθεσίες',
                                emoji: '📍'
                            },
                            {
                                description: 'Οργανώνει τα δεδομένα',
                                emoji: '🗄️'
                            },
                            {
                                description: 'Κάνει την πληροφορία προσβάσιμη',
                                emoji: '🔍'
                            },
                            {
                                description: 'Δημιουργεί podcast',
                                emoji: '🎙️'
                            },
                            {
                                description: 'Μοντάρει σύντομα βίντεο',
                                emoji: '📱'
                            },
                            {
                                description: 'Ενημερώνει τους δημότες',
                                emoji: '💬'
                            }
                        ].map((step, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1, duration: 0.5 }}
                                viewport={{ once: true }}
                            >
                                <Card className="h-full hover:shadow-lg hover:scale-[1.01] transition-all duration-300">
                                    <CardContent className="p-4 sm:p-6 flex items-center gap-4">
                                        <span className="text-2xl sm:text-3xl">{step.emoji}</span>
                                        <p className="text-sm sm:text-base text-muted-foreground">{step.description}</p>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                <motion.section
                    className="flex flex-col items-center gap-6 py-8 sm:py-16"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                >
                    <Button
                        size="lg"
                        asChild
                        className="gap-2 text-base sm:text-lg px-8 py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                        <Link href="https://schemalabs.substack.com/p/pencouncil" target="_blank">
                            <ExternalLink className="w-4 h-4" />
                            Διάβασε περισσότερα για το πως δουλεύει
                        </Link>
                    </Button>

                    <Button
                        size="lg"
                        asChild
                        variant="outline"
                        className="gap-2 text-base sm:text-lg"
                    >
                        <Link href="/about">
                            Αν είστε στην αυτοδιοίκηση, πατήστε εδώ
                        </Link>
                    </Button>
                </motion.section>
            </div>
        </div>
    );
}