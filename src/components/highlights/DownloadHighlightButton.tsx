"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { downloadFile } from "@/lib/export/meetings";

/**
 * Downloads a highlight's rendered video as an mp4 file. Shared by the
 * highlight detail view and the highlight cards; render it only when the
 * highlight has a videoUrl.
 */
export function DownloadHighlightButton({
    videoUrl,
    fileName,
    showLabel = true,
    size = "sm",
}: {
    videoUrl: string;
    /** Name of the saved file, without the .mp4 extension. */
    fileName: string;
    /** false renders an icon-only button (for compact card layouts). */
    showLabel?: boolean;
    size?: "sm" | "icon";
}) {
    const [isDownloading, setIsDownloading] = useState(false);
    const t = useTranslations('highlights');

    const handleDownload = async (e: React.MouseEvent) => {
        // Cards navigate on click; the download must not also open the highlight.
        e.stopPropagation();

        setIsDownloading(true);
        try {
            const response = await fetch(videoUrl);
            if (!response.ok) throw new Error('Failed to fetch video');

            const blob = await response.blob();
            downloadFile(blob, `${fileName}.mp4`);

            toast({
                title: t('common.success'),
                description: t('toasts.downloadStarted'),
                variant: "default",
            });
        } catch (error) {
            console.error('Failed to download video:', error);
            toast({
                title: t('common.error'),
                description: t('toasts.downloadError'),
                variant: "destructive",
            });
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <Button
            variant="outline"
            size={size}
            onClick={handleDownload}
            disabled={isDownloading}
            aria-label={t('details.download')}
        >
            {isDownloading ? (
                <>
                    <div className={`h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${showLabel ? 'mr-2' : ''}`} />
                    {showLabel && t('details.downloading')}
                </>
            ) : (
                <>
                    <Download className={`h-4 w-4 ${showLabel ? 'mr-2' : ''}`} />
                    {showLabel && t('details.download')}
                </>
            )}
        </Button>
    );
}
