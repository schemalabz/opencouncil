import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { RECOGNITION_ITEMS } from './config'

export default function Recognition() {
    return (
        <section className="py-16 md:py-24">
            <motion.div
                className="text-center mb-10 md:mb-14"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                viewport={{ once: true }}
            >
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-light tracking-tight">
                    Διακρίσεις & Αναφορές
                </h2>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {RECOGNITION_ITEMS.map((item, index) => (
                    <motion.a
                        key={item.id}
                        href={item.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col rounded-xl border border-border/50 bg-white p-6 transition-all duration-300 hover:shadow-md hover:border-border/80 no-underline"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.08 }}
                        viewport={{ once: true }}
                    >
                        {/* Logo placeholder */}
                        <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center mb-4">
                            <span className="text-xs font-medium text-muted-foreground/60">
                                {item.title.charAt(0)}
                            </span>
                        </div>

                        <h3 className="text-base font-medium text-foreground group-hover:text-primary transition-colors">
                            {item.title}
                        </h3>
                        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed flex-1">
                            {item.subtitle}
                        </p>

                        <div className="mt-4 flex items-center gap-1 text-xs text-primary/70 group-hover:text-primary transition-colors">
                            <span>Δείτε</span>
                            <ExternalLink className="h-3 w-3" />
                        </div>
                    </motion.a>
                ))}
            </div>
        </section>
    )
}
