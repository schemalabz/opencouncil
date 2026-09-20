"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AdminToolButton } from "@/components/admin/AdminStrip";
import { recordVoicePrintConsent } from "@/lib/actions/personConsent";
import { formatDate } from "@/lib/formatters/time";
import type { VoicePrintConsentStatus } from "@/lib/db/personConsent";

/**
 * The superadmin's control for a person's voiceprint consent: record a
 * consent the person gave outside the app, or withdraw the consent in force
 * on the person's request. The person does not need an account.
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
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState(false);

    const given = status !== null;
    const date = status ? formatDate(new Date(status.givenAt), undefined, locale) : "";
    const recorder = status?.user?.name || status?.user?.email || t("unknownAccount");

    async function save() {
        setSaving(true);
        setFailed(false);
        try {
            await recordVoicePrintConsent(personId, !given);
            setOpen(false);
            router.refresh();
        } catch (error) {
            console.error("Failed to record voiceprint consent:", error);
            setFailed(true);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); setFailed(false); }}>
            <DialogTrigger asChild>
                <AdminToolButton>{given ? t("buttonGiven") : t("buttonNone")}</AdminToolButton>
            </DialogTrigger>
            <DialogContent align="start">
                <DialogHeader>
                    <DialogTitle>{t("title", { name: personName })}</DialogTitle>
                    <DialogDescription>
                        {!status && t("none")}
                        {status?.source === "PERSON" && t("byPerson", { date, recorder })}
                        {status?.source === "ADMIN" && t("byAdmin", { date, recorder })}
                    </DialogDescription>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">{given ? t("withdrawHint") : t("recordHint")}</p>
                <DialogFooter className="gap-3">
                    {failed && <p className="text-sm text-destructive w-full">{t("error")}</p>}
                    <Button variant={given ? "destructive" : "default"} disabled={saving} onClick={save}>
                        {saving ? t("saving") : given ? t("withdraw") : t("record")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
