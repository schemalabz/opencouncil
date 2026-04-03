import { motion } from 'framer-motion'
import { Link } from '@/i18n/routing'
import Marquee from '@/components/ui/marquee'

interface SocialProofProps {
    citiesWithLogos: Array<{ id: string; logoImage: string; name_municipality: string }>
}

export default function SocialProof({ citiesWithLogos }: SocialProofProps) {
    if (!citiesWithLogos.length) return null

    const count = citiesWithLogos.length
    const cities = citiesWithLogos.map(c => ({
        ...c,
        shortName: c.name_municipality.replace(/^Δήμος\s+/i, ''),
    }))

    return (
        <motion.section
            className="py-12 md:py-16"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
        >
            <p className="text-center text-sm sm:text-base md:text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed px-4">
                Σε{' '}
                <span className="font-medium text-foreground">{count} δήμους</span>{' '}
                στην Ελλάδα, από τον Δήμο Σαμοθράκης μέχρι τον Δήμο Αθηναίων.
            </p>

            <div
                className="relative mt-8 w-full overflow-hidden"
                style={{
                    maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
                }}
            >
                <Marquee
                    className="[--duration:30s] [--gap:2rem] sm:[--gap:2.5rem] md:[--gap:3rem] p-0 justify-center"
                    reverse={false}
                    pauseOnHover={true}
                    repeat={5}
                >
                    {cities.map((city) => (
                        <Link
                            key={city.id}
                            href={`/${city.id}`}
                            tabIndex={-1}
                            className="flex-shrink-0 flex flex-col items-center gap-2 group transition-transform duration-200 hover:scale-110 no-underline"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={city.logoImage}
                                alt={city.name_municipality}
                                className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 object-contain"
                            />
                            <span className="text-xs sm:text-sm text-muted-foreground text-center leading-tight max-w-[96px] sm:max-w-[112px]">
                                {city.shortName}
                            </span>
                        </Link>
                    ))}
                </Marquee>
            </div>
        </motion.section>
    )
}
