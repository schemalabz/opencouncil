"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { IMAGE_HEIGHT, IMAGE_WIDTH } from "@opencouncil/subject-images/constants";
import { AdminStrip, AdminToolButton } from "@/components/admin/AdminStrip";
import { ImageCropDialog } from "@/components/ui/ImageCropDialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SUBJECT_IMAGE_TYPES } from "@/lib/utils/imageUpload";
import { subjectImageUrl } from "./SubjectImage";

/**
 * The superadmin actions on a subject's illustration, shown over the image
 * itself: the moment an admin sees an image miss the mark is the moment they
 * are looking at it. Regenerate asks Gemini again and replaces whatever is
 * stored — including a manual upload, which is how one is undone. Replace
 * crops a chosen file to the image's 7:4 and uploads it. `children` adds the
 * page's other back-of-house controls to the same strip.
 *
 * It wears the hazard stripes every admin control row wears, on a near-opaque
 * card ground so the stripes read over any picture. Renders into a `group`
 * parent that is `relative`; the strip shows on hover and on keyboard focus.
 * While hidden it takes no pointer events, or a tap on the image would land
 * on an invisible Regenerate.
 */
export function SubjectImageAdminControls({ subjectId, onChanged, className, children }: {
    subjectId: string;
    onChanged: () => void;
    /** Overrides where the strip sits in the parent; the top-right corner by default. */
    className?: string;
    children?: ReactNode;
}) {
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
            <AdminStrip
                className={cn(
                    "pointer-events-none absolute right-3 top-3 z-10 bg-card/95 opacity-0 shadow-sm backdrop-blur transition-opacity",
                    "focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100",
                    className,
                )}
            >
                <AdminToolButton type="button" disabled={busy} onClick={regenerate}>
                    {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                    {t("regenerateImage")}
                </AdminToolButton>
                <AdminToolButton type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {t("replaceImage")}
                </AdminToolButton>
                {children}
                <input
                    ref={fileInput}
                    type="file"
                    accept={SUBJECT_IMAGE_TYPES.join(",")}
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setCropFile(file);
                        e.target.value = "";
                    }}
                />
            </AdminStrip>

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
