import { motion } from 'framer-motion'
import { ExternalLink, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { RECOGNITION_ITEMS } from './config'

export default function Recognition() {
    const t = useTranslations('about')
    const tq = useTranslations('about.quotes')

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
                    {t('recognition.title')}
                </h2>
            </motion.div>

            {/* Pullquote */}
            <motion.figure
                className="text-center max-w-2xl mx-auto mb-12 md:mb-16"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7 }}
                viewport={{ once: true }}
            >
                <blockquote className="text-lg sm:text-xl md:text-2xl font-light leading-relaxed tracking-tight text-foreground/80 italic">
                    &ldquo;{tq('items.chania.quote')}&rdquo;
                </blockquote>
                <figcaption className="mt-4 flex flex-col items-center gap-0.5">
                    <span className="text-sm font-medium text-foreground">{tq('items.chania.name')}</span>
                    <span className="text-sm text-muted-foreground">{tq('items.chania.role')}</span>
                </figcaption>
            </motion.figure>

            <div className="mx-auto grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/50 bg-border/50 lg:grid-cols-3">
                {RECOGNITION_ITEMS.map((item, index) => {
                    const hasLink = !!item.linkUrl
                    const cardClass = cn(
                        'group relative flex h-full flex-col items-center bg-white px-5 py-7 text-center transition-colors duration-200',
                        hasLink && 'hover:bg-muted/30'
                    )

                    const cardContent = (
                        <>
                            {hasLink && (
                                <ExternalLink className="absolute right-3.5 top-3.5 h-3.5 w-3.5 text-muted-foreground/30 transition-colors group-hover:text-foreground" />
                            )}

                            <div className="flex h-12 items-center justify-center">
                                {item.logoUrl ? (
                                    <Image
                                        src={item.logoUrl}
                                        alt={t(`recognition.items.${item.id}.title`)}
                                        width={160}
                                        height={48}
                                        className={cn('w-auto object-contain', item.logoClassName ?? 'max-h-8 max-w-[120px]')}
                                    />
                                ) : (
                                    <Trophy className="h-9 w-9 text-primary/80" strokeWidth={1.5} />
                                )}
                            </div>

                            <h3 className="mt-5 flex min-h-[2.5rem] items-center justify-center text-sm font-semibold leading-snug text-foreground">
                                {t(`recognition.items.${item.id}.title`)}
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {t(`recognition.items.${item.id}.subtitle`)}
                            </p>
                        </>
                    )

                    return (
                        <motion.div
                            key={item.id}
                            className="h-full"
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.45, delay: index * 0.06 }}
                            viewport={{ once: true }}
                        >
                            {hasLink ? (
                                <a
                                    href={item.linkUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(cardClass, 'no-underline hover:no-underline [&_*]:no-underline')}
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
