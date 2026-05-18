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
import { STORY_TEMPLATES, type StoryTemplateNumber } from "@/components/og/story-template-meta";

interface StoryTemplatePickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    cityId: string;
    meetingId: string;
}

function buildStoryUrl(cityId: string, meetingId: string, template: StoryTemplateNumber): string {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/api/og?cityId=${encodeURIComponent(cityId)}&meetingId=${encodeURIComponent(meetingId)}&variant=story&template=${template}`;
}

export default function StoryTemplatePickerDialog({
    open,
    onOpenChange,
    cityId,
    meetingId,
}: StoryTemplatePickerDialogProps) {
    const [downloading, setDownloading] = useState<StoryTemplateNumber | null>(null);

    const handleDownload = async (template: StoryTemplateNumber) => {
        setDownloading(template);
        try {
            const response = await fetch(buildStoryUrl(cityId, meetingId, template));
            if (!response.ok) throw new Error(`Failed to fetch story image (${response.status})`);
            const blob = await response.blob();
            downloadFile(blob, `meeting-story-${meetingId}-t${template}.png`);
        } catch (error) {
            console.error("Error downloading story image:", error);
        } finally {
            setDownloading(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Επιλέξτε στυλ Story</DialogTitle>
                    <DialogDescription>
                        4 διαφορετικά εικαστικά για την ίδια πληροφορία. Επιλέξτε αυτό που ταιριάζει.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {STORY_TEMPLATES.map(({ id, name, description }) => {
                        const previewUrl = buildStoryUrl(cityId, meetingId, id);
                        const isDownloading = downloading === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => handleDownload(id)}
                                disabled={downloading !== null}
                                className="group relative flex flex-col rounded-lg border bg-card text-left overflow-hidden transition-all hover:shadow-md hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <div className="relative aspect-[9/16] bg-muted">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={previewUrl}
                                        alt={`${name} preview`}
                                        loading="lazy"
                                        className="absolute inset-0 w-full h-full object-cover"
                                    />
                                    {isDownloading && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
                                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 py-1.5 bg-gradient-to-t from-black/60 to-transparent text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Download className="w-3 h-3" />
                                        <span>Λήψη</span>
                                    </div>
                                </div>
                                <div className="p-2.5">
                                    <div className="text-sm font-medium leading-tight">{name}</div>
                                    <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                                        {description}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="flex justify-end pt-2">
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        Κλείσιμο
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
