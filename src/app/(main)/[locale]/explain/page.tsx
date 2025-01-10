'use client'

import { motion } from 'framer-motion'
import { Bot, Database, Share2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WordRotator } from '@/components/ui/word-rotator'

export default function ExplainPage() {
    return (
        <div className="relative">
            <div className="container mx-auto px-4 py-8">
                {/* Hero Section */}
                <motion.section
                    className="relative text-center py-10 h-[50vh] min-h-[400px] flex flex-col justify-center items-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                >
                    <div className="flex flex-col items-center justify-center h-full z-10 relative">
                        <h1 className="text-xl md:text-2xl mb-4">
                            Η αυτοδιοίκηση λύνει καθημερινά προβλήματα.
                            <div className="text-5xl font-bold my-12">
                                <WordRotator words={['🛣️ Τους δρόμους μας', '🏘️ Τις γειτονιές μας', '🏫 Τα σχολεία μας', '🌳 Τα πάρκα μας', '🕒 Ωράρια κατασημάτων', '🚦 Κυκλοφοριακές ρυθμίσεις', '🧹 Καθαριότητα']} />
                            </div>
                        </h1>
                        <motion.p
                            className="text-xl md:text-2xl mb-8 max-w-3xl"
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.5, duration: 0.8 }}
                        >
                            Το OpenCouncil κάνει τις δημόσιες συνεδριάσεις της αυτοδιοίκησης απλές και πιο συμμετοχικές.
                        </motion.p>
                    </div>
                </motion.section>
                {/* Features Section */}
                <motion.section
                    className="py-16 container mx-auto"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <div className="grid grid-cols-2 gap-4">
                        {[
                            {
                                description: 'Διαβάζουμε την ημερήσια διάταξη',
                                emoji: '📜'
                            },
                            {
                                description: 'Βλέπουμε τη συνεδρίαση',
                                emoji: '📹'
                            },
                            {
                                description: 'Αναγνωρίζουμε τους ομιλητές',
                                emoji: '🗣️'
                            },
                            {
                                description: 'Καταγράφουμε τα πρακτικά',
                                emoji: '📚'
                            },
                            {
                                description: 'Εντοπίζουμε θέματα και τοποθεσίες',
                                emoji: '📍'
                            },
                            {
                                description: 'Οργανώνουμε τα δεδομένα',
                                emoji: '🗄️'
                            },
                            {
                                description: 'Κάνουμε την πληροφορία προσβάσιμη',
                                emoji: '🔍'
                            },
                            {
                                description: 'Δημιουργούμε podcast',
                                emoji: '🎙️'
                            },
                            {
                                description: 'Φτιάχνουμε σύντομα βίντεο',
                                emoji: '📱'
                            },
                            {
                                description: 'Ενημερώνουμε τους δημότες',
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
                                <Card className="h-full">
                                    <CardContent className="p-3 flex items-center gap-2">
                                        <span className="text-xl">{step.emoji}</span>
                                        <p className="text-sm">{step.description}</p>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>
            </div>
        </div>
    )
}