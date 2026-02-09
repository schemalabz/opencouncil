"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, PlayCircle, PauseCircle } from "lucide-react";
import { useVideo } from "@/components/meetings/VideoProvider";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface PlayPauseButtonProps {
    startTimestamp: number;
    endTimestamp: number;
    /** Show text labels (play/pause/seek to) next to icons */
    showLabel?: boolean;
    /** Use circle variant of icons (PlayCircle/PauseCircle) */
    circleIcons?: boolean;
    /** Additional CSS classes */
    className?: string;
    /** Stop event propagation on click */
    stopPropagation?: boolean;
}

/**
 * A memoized play/pause button that tracks video state.
 * Only this component re-renders when video state changes.
 */
export const PlayPauseButton = memo(function PlayPauseButton({
    startTimestamp,
    endTimestamp,
    showLabel = false,
    circleIcons = false,
    className,
    stopPropagation = false,
}: PlayPauseButtonProps) {
    const { isPlaying, currentTime, seekToAndPlay, setIsPlaying } = useVideo();
    const t = useTranslations("transcript.miniTranscript");

    // Check if current time is within this segment's range
    const isWithinRange = currentTime >= startTimestamp && currentTime <= endTimestamp;

    // Determine button state:
    // - Playing + within range = Pause
    // - Playing + outside range = Seek to
    // - Not playing = Play
    const isThisPlaying = isPlaying && isWithinRange;
    const shouldShowSeek = isPlaying && !isWithinRange;

    const handleClick = (e: React.MouseEvent) => {
        if (stopPropagation) {
            e.stopPropagation();
        }
        if (isThisPlaying) {
            setIsPlaying(false);
        } else {
            seekToAndPlay(startTimestamp);
        }
    };

    // Select icon components based on circleIcons prop
    const PlayIcon = circleIcons ? PlayCircle : Play;
    const PauseIcon = circleIcons ? PauseCircle : Pause;

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            className={cn(
                showLabel ? "h-8 px-3 text-xs font-medium" : "transition-colors hover:bg-primary hover:text-primary-foreground",
                className
            )}
        >
            {isThisPlaying ? (
                <>
                    <PauseIcon className={cn("w-4 h-4", showLabel && "mr-1.5")} />
                    {showLabel && t("pause")}
                </>
            ) : shouldShowSeek && showLabel ? (
                <>
                    <PlayIcon className="w-4 h-4 mr-1.5" />
                    {t("seekTo")}
                </>
            ) : (
                <>
                    <PlayIcon className={cn("w-4 h-4", showLabel && "mr-1.5")} />
                    {showLabel && t("play")}
                </>
            )}
        </Button>
    );
});
