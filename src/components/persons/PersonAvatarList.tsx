"use client";
import { PersonBadge } from "./PersonBadge";
import { cn } from "@/lib/utils";
import { Pen } from "lucide-react";
import { PersonWithRelations } from '@/lib/db/people';
import { useRef, useState, useEffect, useCallback } from "react";

interface PersonAvatarListProps {
    users: (PersonWithRelations & { isIntroducer?: boolean })[];
    className?: string;
    maxDisplayed?: number;
    numMore?: number;
    autoScroll?: boolean;
    isHovered?: boolean;
}

export function PersonAvatarList({
    users,
    className,
    maxDisplayed = 5,
    numMore,
    autoScroll = false,
    isHovered = false,
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

    const content = (
        <div
            ref={containerRef}
            className={cn(
                "z-10 flex",
                autoScroll ? "overflow-hidden" : "-space-x-4 rtl:space-x-reverse",
                className
            )}
        >
            <div ref={innerRef} className={cn("flex", autoScroll ? "-space-x-2" : "-space-x-4 rtl:space-x-reverse")}>
                {users.slice(0, displayCount).map((user) => (
                    <div key={user.id} onClick={(e) => e.stopPropagation()} className="relative shrink-0">
                        <PersonBadge
                            person={user}
                            short
                        />
                        {user.isIntroducer && (
                            <div className="absolute top-0 left-0 bg-background rounded-full w-4 h-4 flex items-center justify-center ring-[1.5px] ring-background">
                                <Pen className="w-2.5 h-2.5 text-foreground" />
                            </div>
                        )}
                    </div>
                ))}
                {remainingCount > 0 && (
                    <div className="inline-flex items-center py-1 pr-1 shrink-0">
                        <div className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-muted text-center text-sm font-medium text-muted-foreground">
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
