import { motion } from 'framer-motion'
import { ExternalLink, Trophy } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {RECOGNITION_ITEMS.map((item, index) => {
                    const hasLink = !!item.linkUrl
                    const cardClass = cn(
                        'flex flex-col rounded-xl border border-border/50 bg-white p-6 h-full transition-shadow duration-200',
                        hasLink && 'hover:shadow-md'
                    )

                    const cardContent = (
                        <>
                            <div className="h-10 mb-4 flex items-center">
                                {item.logoUrl ? (
                                    <Image
                                        src={item.logoUrl}
                                        alt={item.title}
                                        width={120}
                                        height={40}
                                        className="h-8 w-auto max-w-[120px] object-contain object-left"
                                    />
                                ) : (
                                    <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-primary/10">
                                        <Trophy className="h-5 w-5 text-primary" />
                                    </div>
                                )}
                            </div>

                            <h3 className="text-sm font-semibold text-foreground leading-snug">
                                {item.title}
                            </h3>
                            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed flex-1">
                                {item.subtitle}
                            </p>

                            {hasLink && (
                                <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground/60">
                                    <ExternalLink className="h-3 w-3" />
                                </div>
                            )}
                        </>
                    )

                    return (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.08 }}
                            viewport={{ once: true }}
                        >
                            {hasLink ? (
                                <a
                                    href={item.linkUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(cardClass, 'no-underline [&_*]:no-underline')}
                                >
                                    {cardContent}
                                </a>
                            ) : (
                                <div className={cardClass}>
                                    {cardContent}
                                </div>
                            )}
                        </motion.div>
                    )
                })}
            </div>
        </section>
    )
}
