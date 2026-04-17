"use client";

import { useState, useLayoutEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Bell, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "@/i18n/routing";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import Icon from "@/components/icon";
import { SubjectTopic, SubjectLocation } from "@/hooks/useSubjectSubscribe";
import { useToast } from "@/hooks/use-toast";
import { useSubjectSubscribeContext } from "./SubjectSubscribeContext";

type SubjectSubscribeButtonProps = {
    topic: SubjectTopic;
    location: SubjectLocation;
};

/**
 * Persistent subscribe button shown in the top-right area of subject pages.
 * Handles three user states:
 * - No topic: renders nothing
 * - Unauthenticated: click redirects to notifications page
 * - Authenticated: opens popover with pre-selected checkboxes; shows a dot indicator if already subscribed
 */
export function SubjectSubscribeButton({
    topic,
    location,
}: SubjectSubscribeButtonProps) {
    const t = useTranslations("SubjectSubscribe");
    const locale = useLocale();
    const { toast } = useToast();

    const { isAuthenticated, isTopicSubscribed, isLocationSubscribed, isLoading, isSaving, save, notificationsPageUrl } =
        useSubjectSubscribeContext();

    const isSubscribed = isTopicSubscribed && (!location || isLocationSubscribed);

    const [open, setOpen] = useState(false);
    const [topicChecked, setTopicChecked] = useState(false);
    const [locationChecked, setLocationChecked] = useState(false);

    // One-shot sync: populate checkboxes only on first open (or after loading completes on first open).
    // Using a ref guard prevents external subscription state changes from overwriting unsaved user edits.
    const hasSyncedRef = useRef(false);
    useLayoutEffect(() => {
        if (!open) { hasSyncedRef.current = false; return; }
        if (!isLoading && !hasSyncedRef.current) {
            setTopicChecked(isTopicSubscribed);
            setLocationChecked(isLocationSubscribed);
            hasSyncedRef.current = true;
        }
    }, [open, isLoading, isTopicSubscribed, isLocationSubscribed]);

    // Don't render if there's no topic
    if (!topic) return null;

    // Unauthenticated: simple link to notifications page, no popover needed
    if (!isAuthenticated) {
        return (
            <Button variant="ghost" size="icon" aria-label={t("subscribe")} className="w-9 h-9 rounded-full hover:bg-accent transition-colors" asChild>
                <Link href={notificationsPageUrl}>
                    <Bell className="h-4 w-4" />
                </Link>
            </Button>
        );
    }

    const hasChanges = topicChecked !== isTopicSubscribed || locationChecked !== isLocationSubscribed;

    const handleConfirm = async () => {
        if (!hasChanges) return;

        const success = await save(topicChecked, locationChecked);

        if (success) {
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
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("subscribe")} aria-pressed={isSubscribed} className="w-9 h-9 rounded-full hover:bg-accent transition-colors relative">
                    <Bell className="w-4 h-4" />
                    {isSubscribed && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4" align="end">
                <div className="space-y-3">
                    {isLoading ? (
                        <div className="flex justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            <p className="text-sm font-medium">{t("subscribeTo")}</p>

                            {/* Topic checkbox */}
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                    checked={topicChecked}
                                    onCheckedChange={(checked) => setTopicChecked(checked === true)}
                                />
                                <div
                                    className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-xs font-medium"
                                    style={{
                                        backgroundColor: topic.colorHex ? topic.colorHex + "20" : "#e5e7eb",
                                        color: topic.colorHex || "#6b7280",
                                    }}
                                >
                                    <Icon name={topic.icon ?? "Tag"} size={12} color={topic.colorHex || "#6b7280"} />
                                    <span>{locale === 'el' ? topic.name : (topic.name_en || topic.name)}</span>
                                </div>
                            </label>

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

                            <Button
                                className="w-full"
                                size="sm"
                                disabled={!hasChanges || isSaving}
                                onClick={handleConfirm}
                            >
                                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {t("confirmSubscribe")}
                            </Button>
                        </>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
