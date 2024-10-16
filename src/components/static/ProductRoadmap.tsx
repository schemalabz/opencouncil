'use client'

import { useEffect, useRef } from 'react'
import { motion, useAnimation, useInView, useScroll, useTransform } from 'framer-motion'
import { BotMessageSquare, Globe, Github, Database, Zap, Rocket, Shield, Smartphone, Recycle, ScrollText, Mail, Vote, Scroll } from 'lucide-react'

const features = [
    {
        name: "Ανοιχτός κώδικας",
        date: "Οκτώβριος 2024",
        description: "Διαφανής ανάπτυξη, συνεχής βελτίωση. Ελαστική άδεια που επιτρέπει την εμπορική χρήση.",
        icon: Github
    },
    {
        name: "Ανοιχτά Δεδομένα",
        date: "Οκτώβριος 2024",
        description: "Όλα τα δεδομένα, διαθέσιμα δημόσια μέσω ενός ανοιχτού API χωρίς αυθεντικοποίηση.",
        icon: Database
    },
    {
        name: "Βοηθός συνομιλίας AI",
        date: "Οκτώβριος 2024",
        description: "Κάντε ερωτήσεις σχετικά με τις συνεδριάσεις του συμβουλίου και λάβετε απαντήσεις από τον βοηθό συνομιλίας AI.",
        icon: BotMessageSquare
    },
    {
        name: "Πολύγλωσσο",
        date: "Νοέμβριος 2024",
        description: "Υποστήριξη πολλαπλών γλωσσών για την εξυπηρέτηση πολυπολιτισμικών πόλεων.",
        icon: Globe
    },
    {
        name: "Σύνδεση με την ημερήσια διάταξη",
        date: "Δεκέμβριος 2024",
        description: "Οι απομαγνητοφωνήσεις θα συνδέονται με την ημερήσια διάταξη του εκάστοτε δημοτικού συμβουλίου.",
        icon: Scroll
    },
    {
        name: "Προσωποποιημένα newsletters",
        date: "Ιανουάριος 2025",
        description: "Αυτοματοποιημένη αποστολή εξατομικευμένων ενημερώσεων στους πολίτες.",
        icon: Mail
    },
    {
        name: "Καταγραφή παρουσιών και ψηφισμάτων",
        date: "Μάρτιος 2025",
        description: "Αυτόματη καταγραφή παρουσιών και ψηφισμάτων των μελών του συμβουλίου.",
        icon: Vote
    }
]

function FeatureItem({ feature, index, progress }: { feature: any, index: number, progress: any }) {
    const ref = useRef(null)
    const isInView = useInView(ref, { once: true, margin: "-100px" })
    const mainControls = useAnimation()

    useEffect(() => {
        if (isInView) {
            mainControls.start("visible")
        }
    }, [isInView, mainControls])

    const IconComponent = feature.icon
    const iconColor = useTransform(
        progress,
        [index / features.length, (index + 1) / features.length],
        ["#D1D5DB", "#000000"]
    )

    return (
        <motion.div
            ref={ref}
            initial="hidden"
            animate={mainControls}
            variants={{
                hidden: { opacity: 0, y: 50 },
                visible: { opacity: 1, y: 0 }
            }}
            transition={{ duration: 0.5, delay: index * 0.2 }}
            className="flex items-center"
        >
            <div className="w-1/2 pr-8 flex flex-col items-end">
                {index % 2 === 0 ? (
                    <p className="text-sm font-semibold text-gray-500">{feature.date}</p>
                ) : (
                    <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm max-w-xs">
                        <h3 className="font-bold text-lg">{feature.name}</h3>
                        <p className="text-sm">{feature.description}</p>
                    </div>
                )}
            </div>
            <div className="w-12 flex justify-center">
                <motion.div
                    className="w-12 h-12 bg-white border-2 border-black rounded-full flex items-center justify-center z-10"
                    style={{ borderColor: iconColor }}
                >
                    <motion.div style={{ color: iconColor }}>
                        <IconComponent size={24} />
                    </motion.div>
                </motion.div>
            </div>
            <div className="w-1/2 pl-8 flex flex-col items-start">
                {index % 2 === 0 ? (
                    <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm max-w-xs">
                        <h3 className="font-bold text-lg">{feature.name}</h3>
                        <p className="text-sm">{feature.description}</p>
                    </div>
                ) : (
                    <p className="text-sm font-semibold text-gray-500">{feature.date}</p>
                )}
            </div>
        </motion.div>
    )
}
export default function ProductRoadmap() {
    const containerRef = useRef(null)
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start end", "end start"]
    })
    const lineRef = useRef(null)

    const lineHeight = useTransform(
        scrollYProgress,
        [0, 1],
        ["0%", "110%"]
    )
    return (
        <div ref={containerRef} className="max-w-4xl mx-auto py-16 px-4">
            <h2 className="text-3xl font-bold mb-12 text-center">Πλάνο ανάπτυξης</h2>
            <div className="relative">
                <div
                    ref={lineRef}
                    className="absolute left-1/2 transform -translate-x-1/2 h-full w-0.5 bg-gray-200"
                >
                    <motion.div
                        className="absolute top-0 left-0 right-0 bg-black origin-top"
                        style={{ height: lineHeight }}
                    />
                </div>
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10 20L19.0526 5L0.947441 5L10 20Z" fill="black" />
                    </svg>
                </div>
                <div className="space-y-16">
                    {features.map((feature, index) => (
                        <FeatureItem key={index} feature={feature} index={index} progress={scrollYProgress} />
                    ))}
                </div>
            </div>
        </div>
    )
}