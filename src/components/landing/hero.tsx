import { motion, useScroll, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { ChevronDown } from 'lucide-react';
import { SubstackPost } from '@/lib/db/landing';
import { HeaderBar } from './header-bar';

interface HeroProps {
    latestPost?: SubstackPost;
}

export function Hero({ latestPost }: HeroProps) {
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
        <section className="relative min-h-[85vh] flex items-start justify-center overflow-hidden pt-12 sm:pt-16 w-full">
            {/* Mobile view */}
            <div className="absolute top-0 left-0 right-0 px-4 sm:hidden z-10">
                <div className="flex justify-center items-center">
                    <HeaderBar
                        latestPost={latestPost}
                        isMobile={true}
                        className="mt-2"
                    />
                </div>
            </div>

            {/* Desktop view */}
            <div className="absolute top-0 left-0 right-0 px-4 sm:px-6 lg:px-8 hidden sm:block z-10">
                <div className="flex justify-center items-center max-w-screen-xl mx-auto">
                    <HeaderBar
                        latestPost={latestPost}
                        className="mt-4"
                    />
                </div>
            </div>

            <motion.div
                style={{ opacity, y }}
                variants={container}
                initial="hidden"
                animate="show"
                className="relative text-center space-y-8 sm:space-y-10 w-full max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8 mt-16 sm:mt-20 z-10"
            >
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
                <motion.p
                    variants={item}
                    className="text-sm sm:text-lg md:text-xl lg:text-2xl text-muted-foreground mx-auto leading-relaxed"
                >
                    To OpenCouncil χρησιμοποιεί{' '}
                    <motion.em
                        className="not-italic inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-1 text-foreground"
                    >
                        🤖 τεχνητή νοημοσύνη
                    </motion.em>{' '}
                    για να{' '}
                    <motion.em
                        className="not-italic inline-flex items-center px-2 py-1 text-foreground"
                    >
                        👀 παρακολουθεί
                    </motion.em>{' '}
                    τα{' '}
                    <motion.em
                        className="not-italic inline-flex items-center px-2 py-1 text-foreground"
                    >
                        🏛️ δημοτικά συμβούλια
                    </motion.em>{' '}
                    και να τα κάνει{' '}
                    <motion.em
                        className="not-italic inline-flex items-center px-2 py-1 text-foreground"
                    >
                        💡 απλά και κατανοητά
                    </motion.em>
                </motion.p>

                <motion.div
                    variants={item}
                    className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6"
                >
                    <Button
                        asChild
                        size="xl"
                        className="group transition-all duration-300"
                    >
                        <Link href="/signup">
                            <span className="relative z-10">🔔 Γραφτείτε στις ενημερώσεις</span>
                            <motion.div
                                className="absolute inset-0 rounded-xl bg-[hsl(var(--orange))] opacity-0 group-hover:opacity-10 transition-opacity"
                                whileHover={{
                                    boxShadow: "0 0 30px rgba(var(--orange), 0.5)"
                                }}
                            />
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant="outline"
                        size="xl"
                        className="group transition-all duration-300"
                    >
                        <Link href="/explain">
                            <span className="relative z-10">📖 Μάθε πώς δουλεύει</span>
                            <motion.div
                                className="absolute inset-0 rounded-xl bg-[hsl(var(--orange))] opacity-0 group-hover:opacity-10 transition-opacity"
                                whileHover={{
                                    boxShadow: "0 0 30px rgba(var(--orange), 0.5)"
                                }}
                            />
                        </Link>
                    </Button>
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
            </motion.div>
        </section>
    );
}