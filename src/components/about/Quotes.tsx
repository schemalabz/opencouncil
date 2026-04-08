import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const QUOTE_IDS: string[] = ['chania']

export default function Quotes() {
    const t = useTranslations('about.quotes')

    if (QUOTE_IDS.length === 0) return null

    return (
        <div className="bg-orange-50/20">
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
                {QUOTE_IDS.length === 1 ? (
                    // Single quote — typographic centered treatment
                    <motion.figure
                        className="text-center max-w-2xl mx-auto"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7 }}
                        viewport={{ once: true }}
                    >
                        <span className="block text-6xl leading-none text-primary/20 font-serif mb-2" aria-hidden>
                            &ldquo;
                        </span>
                        <blockquote className="text-xl sm:text-2xl md:text-3xl font-light leading-relaxed tracking-tight text-foreground/90 italic">
                            {t(`items.${QUOTE_IDS[0]}.quote`)}
                        </blockquote>
                        <figcaption className="mt-8 flex flex-col items-center gap-1">
                            <span className="block w-8 h-px bg-primary/30 mb-4" />
                            <span className="text-sm font-medium text-foreground">
                                {t(`items.${QUOTE_IDS[0]}.name`)}
                            </span>
                            <span className="text-sm text-muted-foreground">
                                {t(`items.${QUOTE_IDS[0]}.role`)}
                            </span>
                        </figcaption>
                    </motion.figure>
                ) : (
                    // Multiple quotes — card grid
                    <>
                        <motion.p
                            className="text-center text-sm uppercase tracking-widest text-muted-foreground/60 mb-10 md:mb-14"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            transition={{ duration: 0.5 }}
                            viewport={{ once: true }}
                        >
                            {t('whatMunicipalitiesSay')}
                        </motion.p>

                        <div className={`grid gap-6 md:gap-8 ${QUOTE_IDS.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' : 'md:grid-cols-3'}`}>
                            {QUOTE_IDS.map((id, index) => (
                                <motion.blockquote
                                    key={id}
                                    className="relative flex flex-col justify-between rounded-2xl bg-white/60 backdrop-blur-sm p-6 md:p-8 shadow-sm border border-border/30"
                                    initial={{ opacity: 0, y: 30 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: index * 0.1 }}
                                    viewport={{ once: true }}
                                >
                                    <p className="text-base md:text-lg leading-relaxed text-foreground/90">
                                        &ldquo;{t(`items.${id}.quote`)}&rdquo;
                                    </p>
                                    <footer className="mt-6 pt-4 border-t border-border/30">
                                        <p className="text-sm font-medium text-foreground">{t(`items.${id}.name`)}</p>
                                        <p className="text-sm text-muted-foreground">{t(`items.${id}.role`)}</p>
                                    </footer>
                                </motion.blockquote>
                            ))}
                        </div>
                    </>
                )}
            </section>
        </div>
    )
}
