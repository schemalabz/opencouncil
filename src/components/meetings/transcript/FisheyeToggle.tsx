"use client";
import { Button } from "@/components/ui/button";
import { ScanEye, AlignJustify } from "lucide-react";
import { useTranslations } from 'next-intl';
import { useViewMode } from "@/hooks/useViewMode";
import { useTranscriptOptions } from "@/components/meetings/options/OptionsContext";

export default function FisheyeToggle() {
    const [mode, setMode] = useViewMode();
    const { options } = useTranscriptOptions();
    const t = useTranslations('transcript.viewModes');

    // Fish-eye is suppressed in editable mode (Transcript.tsx gates it the
    // same way), so hide the toggle there too — otherwise editors see an
    // "active" button that does nothing and silently writes mode to storage.
    if (options.editable) return null;

    const isFisheye = mode === 'fisheye';
    // Label and icon describe what clicking switches TO.
    const label = isFisheye ? t('default') : t('fisheye');
    const Icon = isFisheye ? AlignJustify : ScanEye;

    return (
        <Button
            onClick={() => setMode(isFisheye ? 'default' : 'fisheye')}
            variant="outline"
            size="sm"
            aria-pressed={isFisheye}
            className="gap-2"
        >
            <Icon className="w-4 h-4" />
            {label}
        </Button>
    );
}
