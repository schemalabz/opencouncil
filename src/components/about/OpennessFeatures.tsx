import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Realm } from '@prisma/client'
import { Link } from '@/i18n/routing'
import { getRealmDomain } from '@/lib/realm'
import { OPENNESS_FEATURES, demoUrlForRealm } from './config'
import type { Feature } from './config'
import BrowserFrame from './BrowserFrame'
import SubjectDemo from './SubjectDemo'
import SearchDemo from './SearchDemo'
import NotificationDemo from './NotificationDemo'
import MapDemo from './MapDemo'
import { HeadingAnchor } from '@/components/explain/HeadingAnchor'

export function FeatureVisual({ feature, realm }: { feature: Feature; realm: Realm }) {
    if (feature.id === 'subjects') {
        return <SubjectDemo realm={realm} />
    }

    if (feature.id === 'search') {
        return <SearchDemo realm={realm} />
    }

    if (feature.id === 'notifications') {
        return <NotificationDemo />
    }

    if (feature.id === 'map') {
        return <MapDemo realm={realm} />
    }

    return (
        <BrowserFrame url={`${getRealmDomain(realm)}${demoUrlForRealm(feature, realm) ?? ''}`}>
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

/**
 * A single openness feature: heading + description with its interactive demo.
 *
 * `layout` controls how the demo sits relative to the text:
 *  - `split`   — two columns, alternating sides (the /about hub layout)
 *  - `stacked` — text with the demo directly below it (reused on /explain)
 */
export function FeatureBlock({
    feature,
    index,
    realm,
    layout = 'split',
    anchorId,
}: {
    feature: Feature
    index: number
    realm: Realm
    layout?: 'split' | 'stacked'
    /** When set, the heading becomes a shareable self-link (used on /explain). */
    anchorId?: string
}) {
    const t = useTranslations('about.openness')
    const stacked = layout === 'stacked'
    const isReversed = layout === 'split' && index % 2 === 1
    const demoLabel = t.has(`features.${feature.id}.demoLabel`) ? t(`features.${feature.id}.demoLabel`) : undefined
    const demoUrl = demoUrlForRealm(feature, realm)

    const text = (
        <>
            {/* status badge — hidden in the stacked (nested) layout */}
            {!stacked && (
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
            )}
            <h3
                className={
                    stacked
                        ? '!text-left text-xl font-normal !leading-none sm:text-2xl'
                        : 'text-2xl md:text-3xl font-medium tracking-tight'
                }
            >
                {anchorId ? (
                    <HeadingAnchor id={anchorId}>{t(`features.${feature.id}.title`)}</HeadingAnchor>
                ) : (
                    t(`features.${feature.id}.title`)
                )}
            </h3>
            <p
                className={
                    stacked
                        ? 'mt-2 text-base text-muted-foreground leading-relaxed'
                        : 'mt-3 text-base md:text-lg text-muted-foreground leading-relaxed'
                }
            >
                {t(`features.${feature.id}.description`)}
            </p>
            {demoUrl && feature.status === 'live' && (
                <Link
                    href={demoUrl}
                    className="inline-flex items-center gap-1.5 mt-5 text-sm font-medium text-primary hover:text-primary/80 transition-colors group"
                >
                    {demoLabel ?? t('tryIt')}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
            )}
        </>
    )

    if (layout === 'stacked') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                viewport={{ once: true, margin: '-80px' }}
            >
                <div className="max-w-2xl">{text}</div>
                <div className="mt-6 md:mt-8">
                    <FeatureVisual feature={feature} realm={realm} />
                </div>
            </motion.div>
        )
    }

    return (
        <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true, margin: '-80px' }}
        >
            <div className={isReversed ? 'md:order-2' : ''}>{text}</div>
            <div className={`transition-transform duration-300 hover:scale-[1.01] ${isReversed ? 'md:order-1' : ''}`}>
                <FeatureVisual feature={feature} realm={realm} />
            </div>
        </motion.div>
    )
}

export default function OpennessFeatures({ realm }: { realm: Realm }) {
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
                    <FeatureBlock key={feature.id} feature={feature} index={index} realm={realm} />
                ))}
            </div>
        </section>
    )
}
