'use client'

import { motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import type { RealmStage } from '@/lib/realm'
import type { AboutPageStats } from '@/lib/db/cities'
import Marquee from '@/components/ui/marquee'
import { Container, reveal, revealDelayed } from './primitives'

interface MunicipalityStripProps {
    citiesWithLogos: Array<{ id: string; logoImage: string; name_municipality: string; name_municipality_en: string; href: string }>
    stats?: AboutPageStats | null
    stage: RealmStage
}

/**
 * The proof under the hero: how many municipalities, how many published
 * meetings, and every municipality's crest. A pending realm borrows the active
 * realms' municipalities, so its line says where they are.
 */
export default function MunicipalityStrip({ citiesWithLogos, stats, stage }: MunicipalityStripProps) {
    const t = useTranslations('about.strip')
    const locale = useLocale()

    if (!citiesWithLogos.length) return null

    // Greek names on the Greek site; every other locale, including French, uses the English name.
    const greekNames = locale === 'el'
    const cities = citiesWithLogos.map((city) => {
        const name = greekNames ? city.name_municipality : city.name_municipality_en
        return { ...city, name, shortName: name.replace(/^(Δήμος|Municipality of)\s+/i, '') }
    })
    const count = stats?.municipalityCount ?? cities.length
    const meetings = stats?.meetingCount ?? 0

    const crestClass = 'group flex flex-col items-center gap-2 no-underline transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:no-underline'
    const crest = (city: { logoImage: string; shortName: string }) => (
        <>
            {/* eslint-disable-next-line @next/next/no-img-element -- crests live on the CDN, at their own sizes */}
            <img src={city.logoImage} alt="" loading="lazy" className="h-12 w-12 object-contain md:h-14 md:w-14" />
            <span className="text-center text-[11px] leading-tight text-muted-foreground transition-colors group-hover:text-foreground">{city.shortName}</span>
        </>
    )

    return (
        <section className="pt-8 pb-14 md:pt-10 md:pb-20">
            <Container>
            <motion.p {...reveal} className="mx-auto max-w-3xl text-center text-[15px] leading-relaxed text-muted-foreground text-balance md:text-[17px]">
                {t.rich(stage === 'pending' ? 'linePending' : 'line', {
                    count,
                    meetings,
                    b: (chunks) => <b className="font-semibold text-foreground">{chunks}</b>,
                })}
            </motion.p>

            {/* One slow row through side fades: twelve crests do not wrap into an orphaned second line, and the row keeps working as the count grows. Hover holds it; reduced motion stops it. */}
            <motion.div
                {...revealDelayed(0.1)}
                className="relative mt-7 w-full overflow-hidden md:mt-9"
                style={{
                    maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
                }}
            >
                <Marquee
                    className="p-0 [--duration:36s] [--gap:1.75rem] sm:[--gap:2.25rem] md:[--gap:2.75rem] motion-reduce:[&>div]:[animation-play-state:paused]"
                    pauseOnHover
                    repeat={5}
                >
                    {cities.map((city) => (
                        <div key={city.id} className="w-[72px] shrink-0 md:w-[84px]">
                            {/* A crest on another realm links to that realm's own domain: an i18n Link would keep it on this host, where the city is a 404. */}
                            {city.href.startsWith('/') ? (
                                <Link href={city.href} title={city.name} className={crestClass}>
                                    {crest(city)}
                                </Link>
                            ) : (
                                <a href={city.href} title={city.name} className={crestClass}>
                                    {crest(city)}
                                </a>
                            )}
                        </div>
                    ))}
                </Marquee>
            </motion.div>
            </Container>
        </section>
    )
}
