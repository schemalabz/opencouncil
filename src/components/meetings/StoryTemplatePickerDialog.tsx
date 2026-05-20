"use client";

import { useState } from "react";
import { Loader2, Download } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { downloadFile } from "@/lib/export/meetings";
import { STORY_TEMPLATES, type StoryTemplateId } from "@/components/og/story-template-meta";

interface StoryTemplatePickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    cityId: string;
    meetingId: string;
}

function buildStoryUrl(cityId: string, meetingId: string, template: StoryTemplateId): string {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/api/og?cityId=${encodeURIComponent(cityId)}&meetingId=${encodeURIComponent(meetingId)}&variant=story&template=${template}`;
}

export default function StoryTemplatePickerDialog({
    open,
    onOpenChange,
    cityId,
    meetingId,
}: StoryTemplatePickerDialogProps) {
    const [downloading, setDownloading] = useState<StoryTemplateId | null>(null);
    // Per-template flag: true once the preview <img> has finished loading (or errored).
    // Drives the "constructing preview" loader on each card.
    const [previewLoaded, setPreviewLoaded] = useState<Record<StoryTemplateId, boolean>>({
        CLASSIC: false,
        DARK: false,
        CARDS: false,
        COLORFUL: false,
    });

    const markPreviewSettled = (id: StoryTemplateId) =>
        setPreviewLoaded((prev) => (prev[id] ? prev : { ...prev, [id]: true }));

    const handleDownload = async (template: StoryTemplateId) => {
        setDownloading(template);
        try {
            const response = await fetch(buildStoryUrl(cityId, meetingId, template));
            if (!response.ok) throw new Error(`Failed to fetch story image (${response.status})`);
            const blob = await response.blob();
            downloadFile(blob, `meeting-story-${meetingId}-${template.toLowerCase()}.png`);
        } catch (error) {
            console.error("Error downloading story image:", error);
        } finally {
            setDownloading(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-7xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl">Επιλέξτε το θέμα του story</DialogTitle>
                    <DialogDescription className="text-base">
                        Υπάρχουν 4 διαθέσιμα θέματα από τα οποία μπορείτε να επιλέξετε.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
                    {(Object.entries(STORY_TEMPLATES) as [StoryTemplateId, typeof STORY_TEMPLATES[StoryTemplateId]][]).map(([id, { name, description }]) => {
                        const previewUrl = buildStoryUrl(cityId, meetingId, id);
                        const isDownloading = downloading === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => handleDownload(id)}
                                disabled={downloading !== null}
                                // Note: only fade non-active buttons. The button being downloaded keeps
                                // opacity 1 so its overlay stays fully visible.
                                className={`group relative flex flex-col rounded-xl border bg-card text-left overflow-hidden transition-all hover:shadow-lg hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed ${downloading !== null && !isDownloading ? "opacity-60" : ""}`}
                            >
                                <div className="relative aspect-[9/16] bg-muted">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={previewUrl}
                                        alt={`${name} preview`}
                                        loading="lazy"
                                        onLoad={() => markPreviewSettled(id)}
                                        onError={() => markPreviewSettled(id)}
                                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${previewLoaded[id] ? "opacity-100" : "opacity-0"}`}
                                    />
                                    {!previewLoaded[id] && !isDownloading && (
                                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-muted px-4 text-center text-muted-foreground">
                                            <Loader2 className="w-10 h-10 animate-spin" />
                                            <span className="text-sm">
                                                Φόρτωση προεπισκόπησης...
                                            </span>
                                        </div>
                                    )}
                                    {isDownloading && (
                                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm px-4 text-center text-white">
                                            <Loader2 className="w-12 h-12 animate-spin" />
                                            <span className="text-sm font-medium">
                                                Downloading...
                                            </span>
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 py-3 bg-gradient-to-t from-black/70 to-transparent text-white text-base opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Download className="w-5 h-5" />
                                        <span>Λήψη</span>
                                    </div>
                                </div>
                                <div className="p-4">
                                    <div className="text-lg font-semibold leading-tight">{name}</div>
                                    <div className="text-sm text-muted-foreground leading-tight mt-1">
                                        {description}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="flex justify-end pt-3">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Κλείσιμο
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
