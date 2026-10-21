"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { getMeetingReleaseOutlook } from "@/lib/actions/meetings";
import type { ReleaseOutlook } from "@/lib/notifications/meetingNotifications";

interface ReleaseMeetingDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    cityId: string;
    meetingId: string;
    onConfirm: () => Promise<void>;
}

/**
 * Before a meeting is released: what the release tells its subscribers by
 * email and by WhatsApp. Both channels follow one rule (lib/notifications/freshness),
 * so the dialog reads one outlook for both.
 */
export function ReleaseMeetingDialog({ open, onOpenChange, cityId, meetingId, onConfirm }: ReleaseMeetingDialogProps) {
    const t = useTranslations("admin.adminActions.releaseDialog");
    const tOutcome = useTranslations("notificationOutcome");
    const tCommon = useTranslations("Common");
    const [outlook, setOutlook] = useState<ReleaseOutlook | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        // Cleared on close, so a reopen never shows the last meeting's outlook for a frame.
        setOutlook(null);
        setLoadFailed(false);
        if (!open) return;
        // A stale answer must not overwrite the dialog that is open now.
        let cancelled = false;
        getMeetingReleaseOutlook(cityId, meetingId)
            .then((result) => { if (!cancelled) setOutlook(result); })
            .catch((error) => {
                console.error("Error loading the release outlook:", error);
                if (!cancelled) setLoadFailed(true);
            });
        return () => { cancelled = true; };
    }, [open, cityId, meetingId]);

    const confirm = async () => {
        setBusy(true);
        try {
            await onConfirm();
        } finally {
            setBusy(false);
        }
    };

    const reasonText = (reason: string) => tOutcome(`reason.${reason}`);

    function emailLine(email: ReleaseOutlook["email"]): string {
        if (email.outcome.kind === "none" || !email.phase) {
            return tOutcome("none", { reason: reasonText(email.outcome.kind === "none" ? email.outcome.reason : "noTasks") });
        }
        const phase = tOutcome(`phase.${email.phase}`);
        if (email.recipients === 0) return t("emailNoRecipients", { phase });
        return t(email.outcome.kind === "sends" ? "emailSends" : "emailWaits", { count: email.recipients, phase });
    }

    // The manual notifications are the way out when the rule creates none, unless the body has them off.
    const showManual = outlook?.email.outcome.kind === "none"
        && outlook.email.outcome.reason !== "noBody"
        && outlook.email.outcome.reason !== "disabled";

    return (
        <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>

                {loadFailed ? (
                    <p className="text-sm text-muted-foreground">{t("loadError")}</p>
                ) : !outlook ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("loading")}
                    </p>
                ) : (
                    <ul className="space-y-3 text-left text-sm">
                        <li className="flex items-start gap-2">
                            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>
                                <span className="font-medium">{t("email")}: </span>
                                {emailLine(outlook.email)}
                                {showManual && (
                                    <span className="mt-1 block text-muted-foreground">{tOutcome("manual")}</span>
                                )}
                            </span>
                        </li>
                        <li className="flex items-start gap-2">
                            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>
                                <span className="font-medium">{t("notis")}: </span>
                                {outlook.notis.phase
                                    ? t("notisEligible", { phase: tOutcome(`phase.${outlook.notis.phase}`) })
                                    : t("notisNone", { reason: reasonText(outlook.notis.reason) })}
                            </span>
                        </li>
                    </ul>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        {tCommon("cancel")}
                    </Button>
                    <Button type="button" onClick={confirm} disabled={busy || (!outlook && !loadFailed)}>
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t("confirm")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
