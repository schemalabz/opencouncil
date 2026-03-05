"use client";

import { FloatingPathsBackground } from "@/components/ui/floating-paths";
import NumberTicker from "@/components/magicui/number-ticker";
import { motion } from "framer-motion";
import { GlobalKPIs } from "@/lib/db/insights";

interface StatsHeroProps {
    kpis: GlobalKPIs;
}

const counters = [
    { key: "cityCount" as const, label: "Δήμοι", unit: "" },
    { key: "meetingCount" as const, label: "Συνεδριάσεις", unit: "" },
    { key: "hoursTranscribed" as const, label: "Ώρες", unit: "h" },
    { key: "wordCount" as const, label: "Λέξεις", unit: "" },
    { key: "speakerCount" as const, label: "Ομιλητές", unit: "" },
];

export function StatsHero({ kpis }: StatsHeroProps) {
    return (
        <section
            data-testid="stats-hero"
            className="relative overflow-hidden bg-background/80 backdrop-blur-sm rounded-2xl border border-border/40 px-8 py-14 text-center"
        >
            <FloatingPathsBackground className="text-primary/30" />
            <div className="relative z-10">
                <motion.h1
                    className="text-3xl md:text-5xl font-bold mb-3 tracking-tight text-foreground"
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    Στατιστικά Πλατφόρμας
                </motion.h1>
                <motion.p
                    className="text-muted-foreground text-base md:text-lg mb-12 max-w-xl mx-auto"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.15 }}
                >
                    Δημοκρατία σε αριθμούς — τι έχουμε καταγράψει μέχρι σήμερα
                </motion.p>
                <motion.div
                    className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6"
                    initial="hidden"
                    animate="visible"
                    variants={{
                        visible: { transition: { staggerChildren: 0.08 } },
                        hidden: {}
                    }}
                >
                    {counters.map(({ key, label, unit }) => (
                        <motion.div
                            key={key}
                            className="flex flex-col items-center gap-1"
                            variants={{
                                hidden: { opacity: 0, y: 20 },
                                visible: { opacity: 1, y: 0 }
                            }}
                        >
                            <span
                                data-testid={`counter-${key}`}
                                className="text-4xl md:text-5xl font-extrabold text-primary tabular-nums"
                            >
                                <NumberTicker value={kpis[key]} />
                                {unit && (
                                    <span className="text-2xl ml-0.5 text-primary/70">{unit}</span>
                                )}
                            </span>
                            <span className="text-sm text-muted-foreground font-medium">{label}</span>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}
