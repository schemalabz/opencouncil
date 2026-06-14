import { cn } from '@/lib/utils';

/** Uppercase, letter-spaced label (the design's "eyebrow"). */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <span
            className={cn(
                'text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground',
                className,
            )}
        >
            {children}
        </span>
    );
}
