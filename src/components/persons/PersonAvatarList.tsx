"use client";
import { PersonBadge } from "./PersonBadge";
import { cn } from "@/lib/utils";
import { PersonWithRelations } from '@/lib/db/people';
import { useRef, useState, useEffect, useCallback } from "react";

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

/** The avatar box for each size, so the "+N" chip matches the circles it follows.
 *  Only `sm` and `md` are in use; the rest keep `md`'s historical 40px. */
const REMAINDER_SIZES: Record<AvatarSize, string> = {
    sm: 'h-8 w-8 sm:h-10 sm:w-10',
    md: 'h-[40px] w-[40px]',
    lg: 'h-[40px] w-[40px]',
    xl: 'h-[40px] w-[40px]',
};

/** How far each circle slides under the one before it — about a quarter of its width, which
 *  reads as a stack while leaving two-letter initials legible. Hovering uncovers the rest. */
const STACK_SPACING: Record<AvatarSize, string> = {
    sm: '-space-x-2 sm:-space-x-2.5',
    md: '-space-x-2.5 sm:-space-x-3',
    lg: '-space-x-3 sm:-space-x-4',
    xl: '-space-x-4 sm:-space-x-6',
};

interface PersonAvatarListProps {
    users: PersonWithRelations[];
    className?: string;
    maxDisplayed?: number;
    numMore?: number;
    autoScroll?: boolean;
    isHovered?: boolean;
    /** Avatar size, forwarded to PersonBadge. `sm` suits dense rows. */
    size?: AvatarSize;
    /** Overlap the circles into a stack, each ringed against the card and lifting on hover. */
    stacked?: boolean;
}

export function PersonAvatarList({
    users,
    className,
    maxDisplayed = 5,
    numMore,
    autoScroll = false,
    isHovered = false,
    size = 'md',
    stacked = false,
}: PersonAvatarListProps) {
    const displayCount = Math.min(users.length, maxDisplayed);
    const remainingCount = numMore ?? (users.length - displayCount);

    const containerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const animationRef = useRef<number | null>(null);

    const checkOverflow = useCallback(() => {
        if (autoScroll && containerRef.current && innerRef.current) {
            setIsOverflowing(innerRef.current.scrollWidth > containerRef.current.offsetWidth);
        }
    }, [autoScroll]);

    useEffect(() => {
        checkOverflow();
        window.addEventListener('resize', checkOverflow);
        return () => window.removeEventListener('resize', checkOverflow);
    }, [checkOverflow, users]);

    useEffect(() => {
        if (!autoScroll || !isOverflowing || !isHovered) {
            if (containerRef.current) containerRef.current.scrollLeft = 0;
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            return;
        }

        const container = containerRef.current;
        const inner = innerRef.current;
        if (!container || !inner) return;

        const maxScroll = inner.scrollWidth - container.offsetWidth;
        const scrollDuration = 2500;
        const pauseDuration = 1200;
        let startTime: number | null = null;
        let direction: 'left' | 'right' | 'pauseLeft' | 'pauseRight' = 'pauseRight';

        const ease = (t: number) =>
            t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;

            if (direction === 'pauseRight') {
                if (elapsed >= pauseDuration) {
                    direction = 'left';
                    startTime = timestamp;
                }
            } else if (direction === 'left') {
                const progress = Math.min(elapsed / scrollDuration, 1);
                container.scrollLeft = ease(progress) * maxScroll;
                if (progress >= 1) {
                    direction = 'pauseLeft';
                    startTime = timestamp;
                }
            } else if (direction === 'pauseLeft') {
                if (elapsed >= pauseDuration) {
                    direction = 'right';
                    startTime = timestamp;
                }
            } else if (direction === 'right') {
                const progress = Math.min(elapsed / scrollDuration, 1);
                container.scrollLeft = maxScroll * (1 - ease(progress));
                if (progress >= 1) {
                    direction = 'pauseRight';
                    startTime = timestamp;
                }
            }

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [autoScroll, isOverflowing, isHovered]);

    const spacing = stacked
        ? STACK_SPACING[size]
        : autoScroll ? "-space-x-2" : "-space-x-4 rtl:space-x-reverse";

    /* Stacked circles are ringed against the card so the overlap stays legible, and each one
       rises out of the stack on hover: it scales up, lifts, and takes a z-index above its
       neighbours, while the rest of the stack fades back. */
    const stackedItem = "rounded-full ring-2 ring-card transition-[transform,opacity,box-shadow] duration-300 ease-out group-hover/avatars:opacity-50 hover:!opacity-100 hover:z-30 hover:-translate-y-1 hover:scale-110 hover:shadow-md";

    const content = (
        <div
            ref={containerRef}
            className={cn(
                "z-10 flex",
                autoScroll ? "overflow-hidden" : spacing,
                className
            )}
        >
            <div
                ref={innerRef}
                className={cn("flex", spacing, stacked && "group/avatars items-center")}
            >
                {users.slice(0, displayCount).map((user) => (
                    <div
                        key={user.id}
                        // The list often sits inside a card-wide <a>. stopPropagation alone keeps
                        // the card's React onClick (which calls preventDefault) from running, so
                        // the anchor's native navigation would override the badge's router.push.
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        className={cn("relative shrink-0", stacked && stackedItem)}
                    >
                        <PersonBadge
                            person={user}
                            short
                            size={size}
                            // Zero the badge padding so the box is the circle: the stack overlaps
                            // by a fraction of the avatar, not of the avatar plus its padding.
                            className={stacked ? "p-0 sm:p-0 rounded-full" : undefined}
                        />
                    </div>
                ))}
                {remainingCount > 0 && (
                    <div className={cn(
                        "shrink-0",
                        stacked ? cn("relative", stackedItem) : "inline-flex items-center py-1 pr-1",
                    )}>
                        <div className={cn("flex items-center justify-center rounded-full bg-muted text-center text-sm font-medium text-muted-foreground", REMAINDER_SIZES[size])}>
                            +{remainingCount}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    if (autoScroll && isOverflowing) {
        return (
            <div className={cn("relative", className)}>
                {content}
                <div className={cn(
                    "absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-card to-transparent z-10 pointer-events-none transition-opacity duration-300",
                    isHovered ? "opacity-0" : "opacity-100"
                )} />
            </div>
        );
    }

    return content;
}
