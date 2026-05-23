"use client";
import { Button } from "@/components/ui/button";
import { ScanEye, AlignJustify } from "lucide-react";
import { useTranslations } from 'next-intl';
import { useViewMode } from "@/hooks/useViewMode";
import { useLayout } from "@/components/meetings/CouncilMeetingWrapper";
import { useTranscriptOptions } from "@/components/meetings/options/OptionsContext";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

export default function FisheyeToggle() {
    const [mode, setMode] = useViewMode();
    const { isWide, isControlsVisible } = useLayout();
    const { options } = useTranscriptOptions();
    const t = useTranslations('transcript.viewModes');

    // Fish-eye is suppressed in editable mode (Transcript.tsx gates it the
    // same way), so hide the toggle there too — otherwise editors see an
    // "active" button that does nothing and silently writes mode to storage.
    if (options.editable) return null;

    const isFisheye = mode === 'fisheye';
    const tooltipText = isFisheye ? t('default') : t('fisheye');

    // Mobile: stack just above the orange show/hide-controls toggle so the
    // pair animates together when the user opens/closes the video bar.
    // Desktop: top-right of the horizontal video controls.
    const position = isWide
        ? 'bottom-24 right-4'
        : `bottom-16 ${isControlsVisible ? 'right-[4.5rem]' : 'right-2'}`;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        onClick={() => setMode(isFisheye ? 'default' : 'fisheye')}
                        variant="outline"
                        size="icon"
                        aria-pressed={isFisheye}
                        aria-label={tooltipText}
                        title={tooltipText}
                        className={`fixed ${position} z-50 bg-background shadow-md hover:shadow-lg transition-all duration-200`}
                    >
                        {isFisheye ? <AlignJustify className="w-4 h-4" /> : <ScanEye className="w-4 h-4" />}
                    </Button>
                </TooltipTrigger>
                <TooltipContent side={isWide ? 'top' : 'left'}>
                    {tooltipText}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
