"use client";

import { useMemo, useState } from "react";
import { Loader2, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { sortSubjectsBySpeakerContributionCount } from "@/lib/utils";
import { STORY_TEMPLATES, type StoryTemplateId } from "@/components/og/story-template-meta";
import { renderStoryTemplate } from "@/components/og/story-templates";
import { getSubjectSections, SECTION_LIMITS } from "@/components/og/story-templates/sections";
import type { PreviewData } from "@/components/og/story-templates/types";
import { downloadFile } from "@/lib/export/meetings";
import { renderStoryToBlob, resolveImageToDataUri } from "@/lib/export/storyImage";

// Native template dimensions. Previews use CSS transform: scale() to fit thumbnail tiles.
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

// Each preview tile renders an actual story template (full-size) scaled down via CSS
// transform so the dialog stays fast even on slow devices. Layout dimensions are still
// the native 1080×1920 — only the paint is scaled — so the download path produces a
// 1:1 pixel-faithful PNG without re-laying anything out.
const PREVIEW_SCALE = 0.28;

const TEMPLATE_IDS = Object.keys(STORY_TEMPLATES) as StoryTemplateId[];

interface StoryTemplatePickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    meetingId: string;
}

export default function StoryTemplatePickerDialog({
    open,
    onOpenChange,
    meetingId,
}: StoryTemplatePickerDialogProps) {
    const { meeting, subjects, city } = useCouncilMeetingData();
    const { toast } = useToast();
    const [downloading, setDownloading] = useState<StoryTemplateId | null>(null);

    // Build the in-memory preview data once per open. cityLogoImage is the raw URL
    // for preview rendering; the download path swaps it for a data URI on click to
    // avoid canvas taint when rasterizing.
    const previewData: PreviewData = useMemo(() => {
        const sorted = sortSubjectsBySpeakerContributionCount(subjects);
        return {
            meetingName: meeting.name,
            meetingDate: new Date(meeting.dateTime),
            cityName: city.name_municipality,
            cityLogoImage: city.logoImage,
            adminBodyName: meeting.administrativeBody?.name,
            totalSubjects: sorted.length,
            blackLogoSrc: "/logo.png",
            whiteLogoSrc: "/white-logo.png",
            ...getSubjectSections(sorted, SECTION_LIMITS),
        };
    }, [meeting, subjects, city]);

    const handleDownload = async (template: StoryTemplateId) => {
        setDownloading(template);
        try {
            const cityLogoImage = await resolveImageToDataUri(city.logoImage);
            const element = renderStoryTemplate(template, { ...previewData, cityLogoImage });
            const blob = await renderStoryToBlob(element, { width: STORY_WIDTH, height: STORY_HEIGHT });
            downloadFile(blob, `meeting-story-${template}-${meetingId}.png`);
            onOpenChange(false);
        } catch (error) {
            console.error("Error generating story image:", error);
            toast({
                title: "Αποτυχία λήψης",
                description: "Δεν ήταν δυνατή η δημιουργία της εικόνας. Δοκίμασε ξανά.",
                variant: "destructive",
            });
        } finally {
            setDownloading(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Επιλογή Story</DialogTitle>
                    <DialogDescription>
                        Διάλεξε ένα από τα τέσσερα θέματα για κατέβασμα ως εικόνα (1080×1920).
                    </DialogDescription>
                </DialogHeader>

                {/* 2×2 grid: each tile is preview + label + description + button.
                    Tiles use flex-col so the button gets pushed to the bottom via mt-auto
                    regardless of how many lines the description wraps to. */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-6 pt-2 justify-items-center">
                    {TEMPLATE_IDS.map((template) => {
                        const meta = STORY_TEMPLATES[template];
                        const isDownloading = downloading === template;
                        return (
                            <div key={template} className="flex flex-col w-full max-w-[320px]">
                                <div
                                    className="relative overflow-hidden rounded-md border bg-muted shadow-sm mx-auto"
                                    style={{
                                        width: STORY_WIDTH * PREVIEW_SCALE,
                                        height: STORY_HEIGHT * PREVIEW_SCALE,
                                    }}
                                >
                                    <div
                                        style={{
                                            width: STORY_WIDTH,
                                            height: STORY_HEIGHT,
                                            transform: `scale(${PREVIEW_SCALE})`,
                                            transformOrigin: "top left",
                                        }}
                                    >
                                        {renderStoryTemplate(template, previewData)}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-0.5 mt-3">
                                    <span className="text-sm font-medium">{meta.name}</span>
                                    <span className="text-xs text-muted-foreground">{meta.description}</span>
                                </div>
                                <Button
                                    onClick={() => handleDownload(template)}
                                    disabled={downloading !== null}
                                    size="sm"
                                    className="w-full mt-auto"
                                >
                                    {isDownloading ? (
                                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                    ) : (
                                        <Download className="w-3 h-3 mr-1.5" />
                                    )}
                                    <span className="text-xs">Λήψη</span>
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
