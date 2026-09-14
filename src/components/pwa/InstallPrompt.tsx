"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { MoreVertical, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { readStored, writeStored } from "@/hooks/useStoredState";
import { captureEvent } from "@/lib/analytics/capture";
import {
    APP_INSTALLED_KEY,
    INSTALL_PROMPT_DELAY_MS,
    INSTALL_PROMPT_DISMISSED_KEY,
    INSTALL_PROMPT_EXCLUDED_PATH,
    detectInstallPlatform,
    isDismissalActive,
    isStandaloneDisplay,
    type BeforeInstallPromptEvent,
    type InstallPlatform,
} from "@/lib/pwa/installPrompt";

// Asks the visitor to install the site as an app. It is a bottom sheet over
// the page on a phone and a corner card on a desktop; it opens on every page load until
// the visitor installs or answers "Not now", which silences it for a week
// (INSTALL_PROMPT_DISMISSAL_MS). Never shown inside the installed app.
export default function InstallPrompt() {
    const t = useTranslations("pwa.installPrompt");
    // Same breakpoint as the `sm:` styles below: modal and full screen under
    // it, a corner card above it.
    const isMobile = useMediaQuery('(max-width: 639px)');
    const [platform, setPlatform] = useState<InstallPlatform | null>(null);
    const [open, setOpen] = useState(false);
    const nativeEvent = useRef<BeforeInstallPromptEvent | null>(null);

    useEffect(() => {
        if (isStandaloneDisplay(window)) return;
        if (INSTALL_PROMPT_EXCLUDED_PATH.test(window.location.pathname)) return;
        if (readStored('local', APP_INSTALLED_KEY) === '1') return;
        if (isDismissalActive(readStored('local', INSTALL_PROMPT_DISMISSED_KEY), Date.now())) return;

        const onBeforeInstallPrompt = (event: Event) => {
            // Keeps Chromium's own mini-infobar away; the Install button
            // below replays the event.
            event.preventDefault();
            nativeEvent.current = event as BeforeInstallPromptEvent;
            setPlatform('native');
        };
        const onAppInstalled = () => {
            writeStored('local', APP_INSTALLED_KEY, '1');
            captureEvent('app_installed');
            setOpen(false);
        };
        window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
        window.addEventListener('appinstalled', onAppInstalled);

        setPlatform((current) => current ?? detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints));
        const timer = window.setTimeout(() => setOpen(true), INSTALL_PROMPT_DELAY_MS);

        return () => {
            window.clearTimeout(timer);
            window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
            window.removeEventListener('appinstalled', onAppInstalled);
        };
    }, []);

    const visible = open && platform !== null && platform !== 'unsupported';

    useEffect(() => {
        if (visible) captureEvent('install_prompt_shown', { platform });
    }, [visible, platform]);

    const dismiss = useCallback(() => {
        writeStored('local', INSTALL_PROMPT_DISMISSED_KEY, String(Date.now()));
        captureEvent('install_prompt_dismissed', { platform });
        setOpen(false);
    }, [platform]);

    const install = useCallback(async () => {
        const event = nativeEvent.current;
        if (!event) return;
        nativeEvent.current = null;
        await event.prompt();
        const { outcome } = await event.userChoice;
        captureEvent('install_prompt_answered', { outcome });
        if (outcome === 'accepted') {
            writeStored('local', APP_INSTALLED_KEY, '1');
            setOpen(false);
        } else {
            dismiss();
        }
    }, [dismiss]);

    if (!visible) return null;

    const steps = platform === 'ios'
        ? [
            { icon: Share, text: t('iosStep1') },
            { icon: SquarePlus, text: t('iosStep2') },
            { icon: SquarePlus, text: t('iosStep3') },
        ]
        : platform === 'android'
            ? [
                { icon: MoreVertical, text: t('androidStep1') },
                { icon: SquarePlus, text: t('androidStep2') },
            ]
            : [];

    return (
        <DialogPrimitive.Root open modal={isMobile} onOpenChange={(next) => { if (!next) dismiss(); }}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-foreground/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
                <DialogPrimitive.Content
                    // On a desktop the dialog is not modal, so a click on the
                    // page must not close it: only "Not now" or Escape do.
                    onInteractOutside={(event) => event.preventDefault()}
                    className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[85vh] flex-col overflow-y-auto rounded-t-2xl bg-background px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] outline-none duration-300 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-8 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[380px] sm:rounded-2xl sm:border sm:p-6 sm:shadow-2xl sm:slide-in-from-bottom-4"
                >
                    <div className="mb-4 flex justify-center sm:hidden" aria-hidden="true">
                        <div className="h-1 w-10 rounded-full bg-border" />
                    </div>
                    <DialogPrimitive.Close
                        aria-label={t('close')}
                        className="absolute right-3 top-3 hidden rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:block"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </DialogPrimitive.Close>

                    <div className="flex items-center gap-4 sm:pr-6">
                        <Image
                            src="/logo.png"
                            alt=""
                            width={56}
                            height={56}
                            className="h-14 w-14 shrink-0 border bg-white object-contain p-2 sm:h-10 sm:w-10 sm:p-1.5"
                        />
                        <div className="space-y-1">
                            <DialogPrimitive.Title className="text-lg font-bold leading-tight tracking-tight sm:text-[15px]">
                                {t('title')}
                            </DialogPrimitive.Title>
                            <DialogPrimitive.Description className="text-sm leading-snug text-muted-foreground sm:text-[13px]">
                                {t('subtitle')}
                            </DialogPrimitive.Description>
                        </div>
                    </div>

                    {steps.length > 0 && (
                        <ol className="mt-5 space-y-3 sm:mt-4 sm:space-y-2">
                            {steps.map(({ icon: Icon, text }, index) => (
                                <li key={text} className="flex items-center gap-3 text-sm">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-muted text-xs font-bold">
                                        {index + 1}
                                    </span>
                                    <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--orange))]" aria-hidden="true" />
                                    <span>{text}</span>
                                </li>
                            ))}
                        </ol>
                    )}

                    <div className="mt-5 flex flex-col gap-1 sm:mt-4 sm:flex-row sm:items-center sm:gap-2">
                        {platform === 'native' && (
                            <Button size="lg" className="w-full sm:h-9 sm:w-auto sm:px-4" onClick={install}>
                                {t('install')}
                            </Button>
                        )}
                        <Button variant="ghost" size="lg" className="w-full text-muted-foreground sm:h-9 sm:w-auto sm:px-3" onClick={dismiss}>
                            {t('notNow')}
                        </Button>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
