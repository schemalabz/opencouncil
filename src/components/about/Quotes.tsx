import { motion } from 'framer-motion'
import { CUSTOMER_QUOTES } from './config'

export default function Quotes() {
    return (
        <div className="bg-orange-50/20">
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
                <motion.p
                    className="text-center text-sm uppercase tracking-widest text-muted-foreground/60 mb-10 md:mb-14"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                >
                    Τι λένε οι δήμοι
                </motion.p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                    {CUSTOMER_QUOTES.map((quote, index) => (
                        <motion.blockquote
                            key={quote.id}
                            className="relative flex flex-col justify-between rounded-2xl bg-white/60 backdrop-blur-sm p-6 md:p-8 shadow-sm border border-border/30"
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            viewport={{ once: true }}
                        >
                            <p className="text-base md:text-lg leading-relaxed text-foreground/90">
                                &ldquo;{quote.quote}&rdquo;
                            </p>
                            <footer className="mt-6 pt-4 border-t border-border/30">
                                <p className="text-sm font-medium text-foreground">
                                    {quote.name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {quote.role}
                                    {quote.municipality && `, ${quote.municipality}`}
                                </p>
                            </footer>
                        </motion.blockquote>
                    ))}
                </div>
            </section>
        </div>
    )
}
