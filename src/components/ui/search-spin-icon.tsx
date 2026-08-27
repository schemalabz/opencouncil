import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The magnifier that turns when its field takes focus.
 *
 * It spins about the lens, not about its own box. Lucide draws the circle at
 * (11,11) of a 24 viewBox and hangs the handle off the bottom-right, so the
 * glyph's centre and the circle's centre are not the same point — rotating
 * about the default origin makes the lens wobble round the handle instead of
 * the handle swinging round the lens. 11/24 is 45.83%.
 *
 * The field it sits in has to carry `group`; the animation is keyed on
 * `group-focus-within`, so it replays every time the field is focused.
 */
export function SearchSpinIcon({ className }: { className?: string }) {
    return (
        <Search
            aria-hidden
            className={cn(
                'origin-[45.83%_45.83%] group-focus-within:animate-search-spin motion-reduce:animate-none',
                className,
            )}
        />
    );
}
