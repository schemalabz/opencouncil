import { Bot, Eye, Building2, Lightbulb } from 'lucide-react';

interface OpenCouncilDescriptionProps {
    className?: string;
    animate?: boolean;
}

export function OpenCouncilDescription({ className = "", animate = false }: OpenCouncilDescriptionProps) {
    return (
        <p className={`text-sm sm:text-lg md:text-xl lg:text-2xl text-muted-foreground mx-auto leading-relaxed ${className}`}>
            To OpenCouncil χρησιμοποιεί{' '}
            <em className="not-italic inline-flex items-center gap-1.5 px-1.5 py-0.5 sm:px-2 sm:py-1 text-foreground">
                <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
                τεχνητή νοημοσύνη
            </em>{' '}
            για να{' '}
            <em className="not-italic inline-flex items-center gap-1.5 px-2 py-1 text-foreground">
                <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                παρακολουθεί
            </em>{' '}
            τα{' '}
            <em className="not-italic inline-flex items-center gap-1.5 px-2 py-1 text-foreground">
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
                δημοτικά συμβούλια
            </em>{' '}
            και να τα κάνει{' '}
            <em className="not-italic inline-flex items-center gap-1.5 px-2 py-1 text-foreground">
                <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5" />
                απλά και κατανοητά
            </em>
        </p>
    );
} 