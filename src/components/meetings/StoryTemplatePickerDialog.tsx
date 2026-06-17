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
// 1:1 pixel-faithful PNG without re-laying anything out. Tiles are scaled purely in CSS
// (scale-[0.27] on mobile, scale-[0.28] from md up); the box dimensions on the preview wrapper
// are STORY_WIDTH/HEIGHT × those scales (1080×0.27≈292, 1920×0.27≈518, 1080×0.28≈302, 1920×0.28≈538).

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

                {/* Single column on mobile, 2×2 grid from md up. The label always sits above
                    the preview (both breakpoints). The download button is overlaid at the top
                    of the preview as a faded, translucent outline button so it stays legible
                    over any template background. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8 md:gap-y-6 pt-2 justify-items-center">
                    {TEMPLATE_IDS.map((template) => {
                        const meta = STORY_TEMPLATES[template];
                        const isDownloading = downloading === template;
                        return (
                            <div key={template} className="flex flex-col w-full max-w-[320px]">
                                <div className="flex flex-col gap-0.5 text-center md:text-left">
                                    <span className="text-sm font-medium">{meta.name}</span>
                                    <span className="text-xs text-muted-foreground">{meta.description}</span>
                                </div>
                                <div className="relative overflow-hidden rounded-md border bg-muted shadow-sm mx-auto mt-3 w-[292px] h-[518px] md:w-[302px] md:h-[538px]">
                                    <div
                                        className="origin-top-left scale-[0.27] md:scale-[0.28]"
                                        style={{ width: STORY_WIDTH, height: STORY_HEIGHT }}
                                    >
                                        {renderStoryTemplate(template, previewData)}
                                    </div>
                                    <Button
                                        onClick={() => handleDownload(template)}
                                        disabled={downloading !== null}
                                        variant="outline"
                                        size="sm"
                                        className="absolute top-2 left-1/2 -translate-x-1/2 h-7 bg-background/50 backdrop-blur-sm border-foreground/20 text-foreground/80 shadow-sm hover:bg-background/80 hover:text-foreground"
                                    >
                                        {isDownloading ? (
                                            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                        ) : (
                                            <Download className="w-3 h-3 mr-1.5" />
                                        )}
                                        <span className="text-xs">Λήψη</span>
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
