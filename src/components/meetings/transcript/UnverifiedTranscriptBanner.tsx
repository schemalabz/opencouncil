"use client";
import { useState, useEffect } from 'react';
import { Bot, X, ChevronDown } from "lucide-react";
import { cn } from '@/lib/utils';
import { useTranslations } from "next-intl";

// Banner height constants
export const BANNER_HEIGHT_FULL = '5.5rem';
export const BANNER_HEIGHT_MINIMIZED = '2.5rem';

interface UnverifiedTranscriptBannerProps {
    isScrolled: boolean;
    onBannerHeightChange?: (height: string) => void;
}

export function UnverifiedTranscriptBanner({ isScrolled, onBannerHeightChange }: UnverifiedTranscriptBannerProps) {
    const [isBannerExpanded, setIsBannerExpanded] = useState(false);
    const [isBannerDismissed, setIsBannerDismissed] = useState(false);
    const tTranscript = useTranslations('transcript');

    // Reset expanded state when scrolling back to top
    useEffect(() => {
        if (!isScrolled) {
            setIsBannerExpanded(false);
        }
    }, [isScrolled]);

    // Determine if banner should show full content
    const showFullBanner = !isScrolled || isBannerExpanded;

    // Calculate banner height for offsetting segment headers
    const bannerHeight = isBannerDismissed ? '0px' : (showFullBanner ? BANNER_HEIGHT_FULL : BANNER_HEIGHT_MINIMIZED);

    // Notify parent of height changes
    useEffect(() => {
        onBannerHeightChange?.(bannerHeight);
    }, [bannerHeight, onBannerHeightChange]);

    if (isBannerDismissed) {
        return null;
    }

    return (
        <div 
            className={cn(
                "sticky top-0 z-40 mb-6 rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 transition-all duration-200 group",
                showFullBanner ? "p-4" : "p-2 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950/30"
            )}
            onClick={(e) => {
                // Only expand if clicking the banner itself, not the X button
                if (!showFullBanner && !(e.target as HTMLElement).closest('button')) {
                    setIsBannerExpanded(true);
                }
            }}
            role={!showFullBanner ? "button" : undefined}
            aria-expanded={showFullBanner}
            tabIndex={!showFullBanner ? 0 : undefined}
            onKeyDown={(e) => {
                if (!showFullBanner && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setIsBannerExpanded(true);
                }
            }}
        >
            <div className={cn(
                "flex gap-3",
                showFullBanner ? "items-start" : "items-center"
            )}>
                <Bot className={cn(
                    "text-yellow-600 dark:text-yellow-500 flex-shrink-0",
                    showFullBanner ? "h-5 w-5 mt-0.5" : "h-4 w-4"
                )} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <p className={cn(
                            "font-medium text-yellow-900 dark:text-yellow-100",
                            showFullBanner ? "text-sm mb-1" : "text-xs leading-none"
                        )}>
                            {tTranscript('unverifiedBanner.title')}
                        </p>
                        {!showFullBanner && (
                            <ChevronDown className="h-3 w-3 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
                        )}
                    </div>
                    {showFullBanner && (
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                            {tTranscript('unverifiedBanner.description')}
                        </p>
                    )}
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsBannerDismissed(true);
                    }}
                    className="p-1 rounded hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors flex-shrink-0"
                    aria-label="Dismiss banner"
                >
                    <X className={cn(
                        "text-yellow-600 dark:text-yellow-500",
                        showFullBanner ? "h-4 w-4" : "h-3.5 w-3.5"
                    )} />
                </button>
            </div>
        </div>
    );
}

