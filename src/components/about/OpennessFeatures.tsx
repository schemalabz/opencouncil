import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import { OPENNESS_FEATURES } from './config'
import type { Feature } from './config'
import BrowserFrame from './BrowserFrame'
import SubjectDemo from './SubjectDemo'
import SearchDemo from './SearchDemo'
import NotificationDemo from './NotificationDemo'
import MapDemo from './MapDemo'

function FeatureVisual({ feature }: { feature: Feature }) {
    if (feature.id === 'subjects') {
        return <SubjectDemo />
    }

    if (feature.id === 'search') {
        return <SearchDemo />
    }

    if (feature.id === 'notifications') {
        return <NotificationDemo />
    }

    if (feature.id === 'map') {
        return <MapDemo />
    }

    return (
        <BrowserFrame url={`opencouncil.gr${feature.demoUrl ?? ''}`}>
            <div className="aspect-[4/3] bg-gradient-to-br from-gray-50 to-white flex items-center justify-center">
                <div className="text-center px-6">
                    <div className="mx-auto mb-3 h-5 w-32 rounded bg-gray-200/70 animate-pulse" />
                    <div className="space-y-2 max-w-xs mx-auto">
                        <div className="h-2.5 w-full rounded bg-gray-200/50 animate-pulse" />
                        <div className="h-2.5 w-5/6 rounded bg-gray-200/50 animate-pulse" />
                        <div className="h-2.5 w-3/5 rounded bg-gray-200/50 animate-pulse" />
                    </div>
                </div>
            </div>
        </BrowserFrame>
    )
}

function FeatureRow({ feature, index, t }: { feature: Feature; index: number; t: ReturnType<typeof useTranslations> }) {
    const isReversed = index % 2 === 1
    const demoLabel = t.has(`features.${feature.id}.demoLabel`) ? t(`features.${feature.id}.demoLabel`) : undefined

    return (
        <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true, margin: '-80px' }}
        >
            {/* Text */}
            <div className={isReversed ? 'md:order-2' : ''}>
                <div className="flex items-center gap-2 mb-3">
                    {feature.status === 'live' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Live
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                            {t('comingSoon')}
                        </span>
                    )}
                </div>
                <h3 className="text-2xl md:text-3xl font-medium tracking-tight">
                    {t(`features.${feature.id}.title`)}
                </h3>
                <p className="mt-3 text-base md:text-lg text-muted-foreground leading-relaxed">
                    {t(`features.${feature.id}.description`)}
                </p>
                {feature.demoUrl && feature.status === 'live' && (
                    <Link
                        href={feature.demoUrl}
                        className="inline-flex items-center gap-1.5 mt-5 text-sm font-medium text-primary hover:text-primary/80 transition-colors group"
                    >
                        {demoLabel ?? t('tryIt')}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                )}
            </div>

            {/* Visual */}
            <div className={`transition-transform duration-300 hover:scale-[1.01] ${isReversed ? 'md:order-1' : ''}`}>
                <FeatureVisual feature={feature} />
            </div>
        </motion.div>
    )
}

export default function OpennessFeatures() {
    const t = useTranslations('about.openness')

    return (
        <section className="py-16 md:py-24">
            <motion.div
                className="text-center mb-12 md:mb-16"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                viewport={{ once: true }}
            >
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-light tracking-tight">
                    {t('title')}{' '}
                    <span className="font-medium">{t('titleHighlight')}</span>
                </h2>
                <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                    {t('subtitle')}
                </p>
            </motion.div>

            <div className="space-y-16 md:space-y-24">
                {OPENNESS_FEATURES.map((feature, index) => (
                    <FeatureRow key={feature.id} feature={feature} index={index} t={t} />
                ))}
            </div>
        </section>
    )
}
