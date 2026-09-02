"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { IMAGE_HEIGHT, IMAGE_WIDTH } from "@opencouncil/subject-images/constants";
import { Button } from "@/components/ui/button";
import { ImageCropDialog } from "@/components/ui/ImageCropDialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { subjectImageUrl } from "./SubjectImage";

/**
 * The two superadmin actions on a subject's illustration, shown over the
 * image itself: the moment an admin sees an image miss the mark is the
 * moment they are looking at it. Regenerate asks Gemini again and replaces
 * whatever is stored — including a manual upload, which is how one is undone.
 * Replace crops a chosen file to the image's 7:4 and uploads it.
 *
 * Renders into a `group` parent that is `relative`; the bar shows on hover
 * and on keyboard focus.
 */
export function SubjectImageAdminControls({ subjectId, onChanged, className }: { subjectId: string; onChanged: () => void; /** Overrides where the bar sits in the parent, e.g. along its top when the foot holds text. */ className?: string }) {
    const t = useTranslations("Subject");
    const { toast } = useToast();
    const [busy, setBusy] = useState(false);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const submit = async (init: RequestInit) => {
        setBusy(true);
        try {
            const res = await fetch(subjectImageUrl(subjectId), { method: "POST", ...init });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(typeof body.error === "string" ? body.error : res.statusText);
            }
            toast({ title: t("imageUpdated") });
            onChanged();
        } catch (error) {
            toast({
                title: t("imageUpdateFailed"),
                description: error instanceof Error ? error.message : undefined,
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    };

    const regenerate = () =>
        submit({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "generate" }) });

    const upload = (file: File) => {
        setCropFile(null);
        const form = new FormData();
        form.append("file", file);
        return submit({ body: form });
    };

    return (
        <>
            <div className={cn("absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100", className)}>
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={regenerate}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {t("regenerateImage")}
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
                    <Upload className="h-4 w-4" />
                    {t("replaceImage")}
                </Button>
                <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setCropFile(file);
                        e.target.value = "";
                    }}
                />
            </div>

            <ImageCropDialog
                file={cropFile}
                cropShape="rect"
                aspect={IMAGE_WIDTH / IMAGE_HEIGHT}
                outputSize={IMAGE_WIDTH}
                title={t("imageDialogTitle")}
                onCancel={() => setCropFile(null)}
                onConfirm={upload}
            />
        </>
    );
}
