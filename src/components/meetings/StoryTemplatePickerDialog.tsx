"use client";

import { useEffect, useState } from "react";
import { Loader2, Download } from "lucide-react";
import { format } from "date-fns";
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
import type { PreviewData } from "@/components/og/story-templates/types";
import { getSubjectSections } from "@/components/og/story-templates/sections";
import { formatDate } from "@/lib/formatters/time";


interface PreviewDataJson extends Omit<PreviewData, "meetingDate"> {
    meetingDate: string;
}

interface StoryTemplatePickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    cityId: string;
    meetingId: string;
}

const TEMPLATE_BUTTON_STYLE: Record<StoryTemplateId, {
    bg: string;
    fg: string;
    accent: string;
    border?: string;
    transform?: string;
    boxShadow?: string;
}> = {
    CLASSIC: { bg: "#F5EFE6", fg: "#111827", accent: "#6B7280", border: "1px solid #E7DDC9" },
    DARK: { bg: "#0B0B0B", fg: "#FFFFFF", accent: "#9CA3AF" },
    CARDS: { bg: "#FAFAF8", fg: "#111827", accent: "#2563EB", border: "1px solid #E5E7EB" },
    COLORFUL: { bg: "#ffbd9c", fg: "#1A1A1A", accent: "#a01212", transform: "rotate(-1deg)", boxShadow: "5px 5px 0 0 #1A1A1A" },
};

const PREVIEW_SUBJECTS_PER_SECTION = 3;

// With a template → returns the rendered-image URL. Without one → returns the cheap
// JSON variant used to populate the preview panel.
function buildStoryUrl(cityId: string, meetingId: string, template?: StoryTemplateId): string {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const tail = template ? `&template=${template}` : "&format=json";
    return `${base}/api/og?cityId=${encodeURIComponent(cityId)}&meetingId=${encodeURIComponent(meetingId)}&variant=story${tail}`;
}

export default function StoryTemplatePickerDialog({
    open,
    onOpenChange,
    cityId,
    meetingId,
}: StoryTemplatePickerDialogProps) {
    const [data, setData] = useState<PreviewData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState<StoryTemplateId | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    // Reset meeting-scoped state when the meeting identity changes. Without this, a parent
    // that re-uses the same dialog instance for a different meeting (re-render without
    // unmount) would leave the fetch effect's `if (data) return` guard short-circuiting on
    // the previous meeting's data.
    useEffect(() => {
        setData(null);
        setError(null);
        setDownloadError(null);
    }, [cityId, meetingId]);

    useEffect(() => {
        if (!open || data) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetch(buildStoryUrl(cityId, meetingId))
            .then(async (r) => {
                if (!r.ok) {
                    if (r.status === 429) throw new Error("Υπήρξε πρόβλημα, δοκιμάστε ξανά σε λίγο.");
                    throw new Error(`Αποτυχία φόρτωσης (${r.status}).`);
                }
                const json = (await r.json()) as PreviewDataJson;
                return { ...json, meetingDate: new Date(json.meetingDate) } satisfies PreviewData;
            })
            .then((d) => { if (!cancelled) setData(d); })
            .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, cityId, meetingId, data]);

    const handleDownload = async (template: StoryTemplateId) => {
        setDownloading(template);
        setDownloadError(null);
        try {
            const response = await fetch(buildStoryUrl(cityId, meetingId, template));
            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error("Υπήρξε πρόβλημα, δοκιμάστε ξανά σε λίγο.");
                }
                throw new Error(`Αποτυχία λήψης (${response.status}).`);
            }
            const blob = await response.blob();
            downloadFile(blob, `meeting-story-${meetingId}-${template.toLowerCase()}.png`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("Error downloading story image:", e);
            setDownloadError(msg);
        } finally {
            setDownloading(null);
        }
    };

    const meetingDate = data?.meetingDate ?? null;
    const weekday = meetingDate ? meetingDate.toLocaleDateString("el-GR", { weekday: "long" }) : "";

    const { preAgenda, agenda, preAgendaShown, agendaShown, preAgendaRemaining, agendaRemaining } =
        getSubjectSections(data?.subjects ?? [], { preAgenda: PREVIEW_SUBJECTS_PER_SECTION, agenda: PREVIEW_SUBJECTS_PER_SECTION });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl">Επιλέξτε το θέμα του story</DialogTitle>
                    <DialogDescription className="text-base">
                        Δείτε τα στοιχεία που θα εμφανίζονται και επιλέξτε ένα από τα 4 διαθέσιμα θέματα για λήψη.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6">
                    <div className="rounded-xl border bg-card p-5 text-left flex flex-col gap-4 min-h-[320px]">
                        {loading && (
                            <div className="flex-1 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                            </div>
                        )}
                        {error && !loading && (
                            <div className="text-sm text-red-600">
                                Αποτυχία φόρτωσης στοιχείων: {error}
                            </div>
                        )}
                        {data && !loading && (
                            <>
                                <div className="flex items-center gap-3">
                                    {data.cityLogoImage && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={data.cityLogoImage}
                                            alt={data.cityName}
                                            className="h-12 w-auto object-contain"
                                        />
                                    )}
                                    <div className="flex flex-col leading-tight">
                                        <span className="font-semibold text-base">{data.cityName}</span>
                                        {data.adminBodyName && (
                                            <span className="text-sm text-muted-foreground">{data.adminBodyName}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col">
                                    <span className="text-2xl font-extrabold leading-tight">Συνεδρίαση</span>
                                    <span className="text-2xl font-extrabold leading-tight">
                                        {meetingDate ? format(meetingDate, "dd.MM.yy") : ""}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                                    {meetingDate && <span>📅 {weekday}, {formatDate(meetingDate)}</span>}
                                    <span>📋 {data.subjects.length} θέματα</span>
                                </div>

                                {preAgendaShown.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                        <div className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                                            Προ ημερησίας συζήτηση ({preAgenda.length})
                                        </div>
                                        <ul className="flex flex-col gap-1 text-sm">
                                            {preAgendaShown.map((s) => (
                                                <li key={s.id} className="flex items-center gap-2 min-w-0">
                                                    <span
                                                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                                        style={{ background: s.topic?.colorHex || "#9CA3AF" }}
                                                    />
                                                    <span className="line-clamp-1">{s.name}</span>
                                                </li>
                                            ))}
                                            {preAgendaRemaining > 0 && (
                                                <li className="text-xs text-muted-foreground">
                                                    + {preAgendaRemaining} ακόμα θέματα προ ημερησίας συζήτησης
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                )}

                                {agendaShown.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                        <div className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                                            Ημερήσια διάταξη ({agenda.length})
                                        </div>
                                        <ul className="flex flex-col gap-1 text-sm">
                                            {agendaShown.map((s) => (
                                                <li key={s.id} className="flex items-center gap-2 min-w-0">
                                                    <span
                                                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                                        style={{ background: s.topic?.colorHex || "#9CA3AF" }}
                                                    />
                                                    <span className="line-clamp-1">{s.name}</span>
                                                </li>
                                            ))}
                                            {agendaRemaining > 0 && (
                                                <li className="text-xs text-muted-foreground">
                                                    + {agendaRemaining} ακόμα θέματα στην ημερήσια διάταξη
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="flex flex-col gap-4">
                        {(Object.entries(STORY_TEMPLATES) as [StoryTemplateId, typeof STORY_TEMPLATES[StoryTemplateId]][]).map(([id, { name, description }]) => {
                            const style = TEMPLATE_BUTTON_STYLE[id];
                            const isDownloading = downloading === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => handleDownload(id)}
                                    disabled={downloading !== null || loading || !!error || !data}
                                    aria-label={`Λήψη θέματος ${name}`}
                                    className="relative rounded-xl px-5 py-4 text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                                    style={{
                                        background: style.bg,
                                        color: style.fg,
                                        border: style.border ?? "1px solid transparent",
                                        transform: style.transform,
                                        boxShadow: style.boxShadow,
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-base font-bold leading-tight">{name}</span>
                                            <span className="text-xs leading-tight mt-0.5" style={{ color: style.accent }}>
                                                {description}
                                            </span>
                                        </div>
                                        <div
                                            className="ml-auto flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0"
                                            style={{ background: `${style.accent}26` }}
                                        >
                                            {isDownloading ? (
                                                <Loader2 className="w-4 h-4 animate-spin" style={{ color: style.fg }} />
                                            ) : (
                                                <Download className="w-4 h-4" style={{ color: style.fg }} />
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                        {downloadError && (
                            <div className="text-xs text-red-600 px-1">{downloadError}</div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end pt-3">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={downloading !== null}>
                        Κλείσιμο
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
