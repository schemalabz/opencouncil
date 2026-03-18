"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Bell, Loader2, MapPin } from "lucide-react";
import { Link } from "@/i18n/routing";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Icon from "@/components/icon";
import { SubjectTopic, SubjectLocation } from "@/hooks/useSubjectSubscribe";
import { useToast } from "@/hooks/use-toast";
import { useSubjectSubscribeContext } from "./SubjectSubscribeContext";

type SubjectNotificationNudgeProps = {
    topic: SubjectTopic;
    location: SubjectLocation;
    cityName: string;
};

export function SubjectNotificationNudge({
    topic,
    location,
    cityName,
}: SubjectNotificationNudgeProps) {
    const t = useTranslations("SubjectSubscribe");
    const locale = useLocale();
    const { toast } = useToast();

    const { isAuthenticated, alreadySubscribed, hasAnyPreferences, isTopicSubscribed, isLocationSubscribed, isLoading, isSaving, save, notificationsPageUrl, isDismissed, dismiss } =
        useSubjectSubscribeContext();

    // Track whether the sentinel has fired separately from whether the modal is open.
    // This lets us wait for preferences to finish loading before deciding to show the modal,
    // so checkboxes reflect the actual subscription state on first open.
    const [triggered, setTriggered] = useState(false);
    const [open, setOpen] = useState(false);
    const [topicChecked, setTopicChecked] = useState(false);
    const [locationChecked, setLocationChecked] = useState(false);

    // When triggered and loading completes: open the modal (unless dismissed or already subscribed)
    // For authenticated users, also skip if they already have preferences anywhere.
    // Also auto-close if alreadySubscribed or isDismissed flips to true while the modal is open.
    useEffect(() => {
        if (open && (alreadySubscribed || isDismissed)) {
            setOpen(false);
            return;
        }
        // alreadySubscribed is derived synchronously from the same state that drives
        // isLoading, so there is no render gap where triggered=true, isLoading=false,
        // and alreadySubscribed is still stale — no modal flicker possible.
        if (!triggered || isLoading || alreadySubscribed || isDismissed) return;
        if (isAuthenticated && hasAnyPreferences) return;
        setOpen(true);
    }, [open, triggered, isLoading, alreadySubscribed, isDismissed, isAuthenticated, hasAnyPreferences]);

    // Sync checkbox state once when modal opens (or when loading finishes on first open).
    // Uses a ref to avoid overwriting user edits if subscription data changes after initial sync.
    // useLayoutEffect prevents a rendered frame where checkboxes show false before the sync runs,
    // which would otherwise cause the Save button to appear falsely enabled.
    const hasSyncedRef = useRef(false);
    useLayoutEffect(() => {
        if (!open) {
            hasSyncedRef.current = false;
            return;
        }
        if (!isLoading && !hasSyncedRef.current) {
            setTopicChecked(isTopicSubscribed);
            setLocationChecked(isLocationSubscribed);
            hasSyncedRef.current = true;
        }
    }, [open, isLoading, isTopicSubscribed, isLocationSubscribed]);

    // Trigger after 25 seconds on the page.
    // alreadySubscribed is checked inside the callback (not in deps) to avoid
    // restarting the timer when prefs finish loading.
    useEffect(() => {
        if (!topic || isDismissed) return;
        const timer = setTimeout(() => {
            setTriggered(true);
        }, 25_000);
        return () => clearTimeout(timer);
    }, [topic?.id, isDismissed]);

    if (!topic) return null;

    const handleDismiss = () => {
        dismiss();
        setOpen(false);
    };

    const hasChanges = topicChecked !== isTopicSubscribed || locationChecked !== isLocationSubscribed;

    const handleConfirm = async () => {
        if (!hasChanges) return;

        const success = await save(topicChecked, locationChecked);

        if (success) {
            dismiss();
            setOpen(false);
            toast({
                title: t("subscribeSuccess"),
                description: t("subscribeSuccessDescription"),
                action: (
                    <Link href={notificationsPageUrl} className="text-sm underline">
                        {t("manageNotifications")}
                    </Link>
                ),
            });
        } else {
            toast({
                title: t("error"),
                description: t("subscribeErrorDescription"),
                action: (
                    <Link href={notificationsPageUrl} className="text-sm underline">
                        {t("manageNotifications")}
                    </Link>
                ),
                variant: "destructive",
            });
        }
    };

    return (
        <>
            <Dialog
                open={open}
                onOpenChange={(val) => {
                    if (!val) handleDismiss();
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Bell className="w-5 h-5" />
                            {t("nudgeTitle")}
                        </DialogTitle>
                        <DialogDescription>
                            {t("nudgeDescription", { cityName })}
                        </DialogDescription>
                    </DialogHeader>

                    {isAuthenticated ? (
                        <div className="space-y-4 pt-2">
                            <p className="text-sm text-muted-foreground">{t("subscribeTo")}</p>
                            <div className="space-y-3">
                                {/* Topic checkbox */}
                                {topic ? (
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={topicChecked}
                                            onCheckedChange={(checked) => setTopicChecked(checked === true)}
                                        />
                                        <div
                                            className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-xs font-medium"
                                            style={{
                                                backgroundColor: topic.colorHex
                                                    ? topic.colorHex + "20"
                                                    : "#e5e7eb",
                                                color: topic.colorHex || "#6b7280",
                                            }}
                                        >
                                            <Icon
                                                name={topic.icon ?? "Tag"}
                                                size={12}
                                                color={topic.colorHex || "#6b7280"}
                                            />
                                            <span>{locale === 'el' ? topic.name : (topic.name_en || topic.name)}</span>
                                        </div>
                                    </label>
                                ) : null}

                                {/* Location checkbox */}
                                {location ? (
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={locationChecked}
                                            onCheckedChange={(checked) => setLocationChecked(checked === true)}
                                        />
                                        <span className="flex items-center gap-1 text-muted-foreground">
                                            <MapPin className="w-3 h-3" />
                                            {location.text}
                                        </span>
                                    </label>
                                ) : null}
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDismiss}
                                    className="flex-1"
                                >
                                    {t("notNow")}
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={!hasChanges || isSaving}
                                    onClick={handleConfirm}
                                    className="flex-1"
                                >
                                    {isSaving ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : null}
                                    {t("confirmSubscribe")}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 pt-2">
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDismiss}
                                    className="flex-1"
                                >
                                    {t("notNow")}
                                </Button>
                                <Button asChild size="sm" className="flex-1">
                                    <Link href={notificationsPageUrl} onClick={handleDismiss}>
                                        {t("goToNotifications")}
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
