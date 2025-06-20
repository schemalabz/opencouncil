import { motion, useScroll, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { SubstackPost } from '@/lib/db/landing';
import { CityMinimalWithCounts } from '@/lib/db/cities';
import { HeaderBar } from './header-bar';
import { MunicipalitySelector } from '@/components/onboarding/selectors/MunicipalitySelector';
import { OpenCouncilDescription } from './OpenCouncilDescription';

interface HeroProps {
    latestPost?: SubstackPost;
    cities: CityMinimalWithCounts[];
    value: CityMinimalWithCounts | null;
    onCitySelect: (city: CityMinimalWithCounts | null) => void;
    isNavigating: boolean;
}

export function Hero({ latestPost, cities, value, onCitySelect, isNavigating }: HeroProps) {
    const { scrollY } = useScroll();
    const opacity = useTransform(scrollY, [0, 200], [1, 0]);
    const y = useTransform(scrollY, [0, 200], [0, 100]);

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.2,
                delayChildren: 0.3,
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <section className="relative min-h-[85vh] flex items-start justify-center overflow-hidden w-full">
            <motion.div
                style={{ opacity, y }}
                variants={container}
                initial="hidden"
                animate="show"
                className="relative w-full max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8"
            >
                <motion.div variants={item} className="flex justify-center items-center pt-4 sm:pt-6">
                    <HeaderBar
                        latestPost={latestPost}
                        className="mt-0"
                    />
                </motion.div>

                <div className="text-center space-y-8 sm:space-y-10 mt-16 sm:mt-20">
                    <motion.div variants={item} className="space-y-6">
                        <motion.h1
                            variants={item}
                            className="text-3xl sm:text-5xl md:text-7xl font-normal"
                        >
                            Ο Δήμος σου,{' '}
                            <span className="relative z-10 text-[hsl(var(--orange))]">
                                απλά
                            </span>
                        </motion.h1>
                    </motion.div>
                    <motion.div variants={item}>
                        <OpenCouncilDescription animate />
                    </motion.div>

                    {/* Municipality Selector */}
                    <motion.div variants={item} className="max-w-md mx-auto">
                        <MunicipalitySelector
                            cities={cities}
                            value={value}
                            onCitySelect={onCitySelect}
                            isNavigating={isNavigating}
                        />
                    </motion.div>

                    <motion.div
                        variants={item}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6"
                    >
                        <Button
                            asChild
                            variant="link"
                            size="lg"
                            className="text-base sm:text-lg text-accent hover:text-accent/80 transition-colors duration-300"
                        >
                            <Link href="/about">
                                Πληροφορίες για δήμους και περιφέρειες
                            </Link>
                        </Button>
                    </motion.div>
                </div>
            </motion.div>
        </section>
    );
}