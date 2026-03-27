import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link } from '@/i18n/routing'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { INTERNAL_FEATURES } from './config'

export default function InternalFeatures() {
    return (
        <div className="bg-gray-50/80">
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
                <motion.div
                    className="text-center mb-12 md:mb-16"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-light tracking-tight">
                        Ό,τι γινόταν σε μέρες,{' '}
                        <span className="font-medium">τώρα γίνεται σε ώρες</span>
                    </h2>
                    <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                        Απομαγνητοφωνήσεις, πρακτικά, αποφάσεις — αυτόματα ή με ελάχιστη ανθρώπινη παρέμβαση.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    {INTERNAL_FEATURES.map((feature, index) => (
                        <motion.div
                            key={feature.id}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            viewport={{ once: true }}
                        >
                            <Card className="h-full bg-white/80 backdrop-blur-sm">
                                <CardHeader className="pb-3">
                                    <div className="mb-2">
                                        {feature.status === 'upcoming' && feature.targetDate && (
                                            <span className="inline-flex items-center text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                                Σύντομα — {feature.targetDate}
                                            </span>
                                        )}
                                        {feature.status === 'live' && (
                                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                Live
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {feature.icon && (
                                            <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-primary/5 flex items-center justify-center">
                                                <feature.icon className="h-4.5 w-4.5 text-primary" />
                                            </div>
                                        )}
                                        <CardTitle className="text-base md:text-lg font-medium">
                                            {feature.title}
                                        </CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                                        {feature.description}
                                    </p>
                                    {feature.demoUrl && feature.status === 'live' && (
                                        <Link
                                            href={feature.demoUrl}
                                            className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-primary hover:text-primary/80 transition-colors group"
                                        >
                                            Δείτε παράδειγμα
                                            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                                        </Link>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </section>
        </div>
    )
}
