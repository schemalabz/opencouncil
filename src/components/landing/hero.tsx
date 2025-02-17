import { motion, useScroll, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { ChevronDown } from 'lucide-react';
import { SubstackBadge } from './substack-badge';
import { SubstackPost } from '@/lib/db/landing';

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
            {latestPost && (
                <div className="absolute top-0 left-0 right-0 px-4 sm:px-6 lg:px-8">
                    <SubstackBadge post={latestPost} />
                </div>
            )}

            <motion.div
                style={{ opacity, y }}
                variants={container}
                initial="hidden"
                animate="show"
                className="relative text-center space-y-8 sm:space-y-10 w-full max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8 mt-16 sm:mt-20"
            >
                <motion.div variants={item} className="space-y-6">
                    <motion.h1
                        variants={item}
                        className="text-3xl sm:text-5xl md:text-7xl font-normal tracking-tight"
                    >
                        TL;DR — ο Δήμος σου,{' '}
                        <span className="relative">
                            <span className="relative z-10 italic text-primary">
                                απλά
                            </span>
                            <motion.span
                                className="absolute inset-0 bg-primary/20 -z-10 blur-2xl"
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1.2 }}
                                transition={{
                                    duration: 1,
                                    repeat: Infinity,
                                    repeatType: "reverse"
                                }}
                            />
                        </span>
                    </motion.h1>
                </motion.div>
                <motion.p
                    variants={item}
                    className="text-sm sm:text-lg md:text-xl lg:text-2xl text-muted-foreground mx-auto leading-relaxed"
                >
                    To OpenCouncil χρησιμοποιεί{' '}
                    <motion.em
                        whileHover={{ scale: 1.1 }}
                        className="not-italic inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md text-primary"
                    >
                        🤖 τεχνητή νοημοσύνη
                    </motion.em>{' '}
                    για να{' '}
                    <motion.em
                        whileHover={{ scale: 1.1 }}
                        className="not-italic inline-flex items-center px-2 py-1 rounded-md text-primary"
                    >
                        👀 παρακολουθεί
                    </motion.em>{' '}
                    τα{' '}
                    <motion.em
                        whileHover={{ scale: 1.1 }}
                        className="not-italic inline-flex items-center px-2 py-1 rounded-md text-primary"
                    >
                        🏛️ δημοτικά συμβούλια
                    </motion.em>{' '}
                    και να τα κάνει{' '}
                    <motion.em
                        whileHover={{ scale: 1.1 }}
                        className="not-italic inline-flex items-center px-2 py-1 rounded-md text-primary"
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
                        size="lg"
                        className="relative group text-base sm:text-lg px-8 py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 bg-primary hover:bg-primary/90"
                    >
                        <Link href="/explain">
                            <span className="relative z-10">📖 Μάθε πώς δουλεύει</span>
                            <motion.div
                                className="absolute inset-0 rounded-xl bg-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                whileHover={{
                                    boxShadow: "0 0 30px rgba(var(--primary), 0.5)"
                                }}
                            />
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant="link"
                        size="lg"
                        className="text-base sm:text-lg hover:text-primary transition-colors duration-300"
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