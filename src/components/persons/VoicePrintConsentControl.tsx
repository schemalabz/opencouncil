"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileCheck } from "lucide-react";
import { recordVoicePrintConsent } from "@/lib/actions/personConsent";
import { formatDate } from "@/lib/formatters/time";
import type { VoicePrintConsentStatus } from "@/lib/db/personConsent";

type Action = "record" | "withdraw";

/**
 * The superadmin's control for a person's voiceprint consent, on the admin
 * people page: record a consent the person gave on paper, or withdraw the
 * consent in force on the person's request. The person does not need an
 * account. A paper consent replaces one given in the app, so both buttons
 * show for that one.
 *
 * The trigger reports the state the way the voiceprint trigger beside it
 * does: the blue border means a consent is in force. The label stays a
 * plain noun, and the tooltip says which of the two ways gave it.
 */
export function VoicePrintConsentControl({ personId, personName, status }: {
    personId: string;
    personName: string;
    status: VoicePrintConsentStatus | null;
}) {
    const t = useTranslations("Person.voicePrintConsent");
    const locale = useLocale();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState<Action | null>(null);
    const [failed, setFailed] = useState(false);

    const given = status !== null;
    const onPaper = status?.source === "ADMIN";
    const date = status ? formatDate(new Date(status.givenAt), undefined, locale) : "";
    const recorder = status?.user?.name || status?.user?.email || t("unknownAccount");

    async function save(action: Action) {
        setSaving(action);
        setFailed(false);
        try {
            await recordVoicePrintConsent(personId, action === "record");
            setOpen(false);
            router.refresh();
        } catch (error) {
            console.error("Failed to record voiceprint consent:", error);
            setFailed(true);
        } finally {
            setSaving(null);
        }
    }

    const label = (action: Action) => (saving === action ? t("saving") : t(action));

    return (
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); setFailed(false); }}>
            <TooltipProvider>
                <Tooltip>
                    <DialogTrigger asChild>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" className={given ? "border-blue-300 text-blue-700" : ""}>
                                <FileCheck className="mr-2 h-4 w-4" />
                                {t("button")}
                            </Button>
                        </TooltipTrigger>
                    </DialogTrigger>
                    <TooltipContent>{t(given ? (onPaper ? "tooltipByAdmin" : "tooltipByPerson") : "none")}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <DialogContent align="start">
                <DialogHeader>
                    <DialogTitle>{t("title", { name: personName })}</DialogTitle>
                    <DialogDescription>
                        {!status && t("none")}
                        {status?.source === "PERSON" && t("byPerson", { date, recorder })}
                        {status?.source === "ADMIN" && t("byAdmin", { date, recorder })}
                    </DialogDescription>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">{onPaper ? t("withdrawHint") : t("recordHint")}</p>
                <DialogFooter className="gap-3">
                    {failed && <p className="text-sm text-destructive w-full">{t("error")}</p>}
                    {given && (
                        <Button variant="destructive" disabled={saving !== null} onClick={() => save("withdraw")}>
                            {label("withdraw")}
                        </Button>
                    )}
                    {!onPaper && (
                        <Button disabled={saving !== null} onClick={() => save("record")}>
                            {label("record")}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
