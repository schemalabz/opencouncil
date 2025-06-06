import { motion } from 'framer-motion';

interface OpenCouncilDescriptionProps {
    className?: string;
    animate?: boolean;
}

export function OpenCouncilDescription({ className = "", animate = false }: OpenCouncilDescriptionProps) {
    const content = (
        <p className={`text-sm sm:text-lg md:text-xl lg:text-2xl text-muted-foreground mx-auto leading-relaxed ${className}`}>
            To OpenCouncil χρησιμοποιεί{' '}
            <em className="not-italic inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-1 text-foreground">
                🤖 τεχνητή νοημοσύνη
            </em>{' '}
            για να{' '}
            <em className="not-italic inline-flex items-center px-2 py-1 text-foreground">
                👀 παρακολουθεί
            </em>{' '}
            τα{' '}
            <em className="not-italic inline-flex items-center px-2 py-1 text-foreground">
                🏛️ δημοτικά συμβούλια
            </em>{' '}
            και να τα κάνει{' '}
            <em className="not-italic inline-flex items-center px-2 py-1 text-foreground">
                💡 απλά και κατανοητά
            </em>
        </p>
    );

    if (animate) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                {content}
            </motion.div>
        );
    }

    return content;
} 