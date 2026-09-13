"use client";

import { useTranslations } from "next-intl";
import { Check, Download } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { captureEvent } from "@/lib/analytics/capture";
import type { InstallApp } from "@/hooks/useInstallApp";

interface InstallAppMenuItemProps {
    install: InstallApp;
    /** Opens the steps dialog for a browser without an install event. */
    onShowSteps: () => void;
    className?: string;
}

/** What an install entry shows: nothing, a disabled "installed" row, or the action. */
export type InstallEntryState = 'hidden' | 'installed' | 'install';

/**
 * What an install entry shows and does, for a menu that is not a Radix
 * dropdown (the landing drawer). `hidden` on a desktop browser that cannot
 * install; `installed` inside the app or once this browser reports it.
 */
export function installAction(install: InstallApp, onShowSteps: () => void): { state: InstallEntryState; onSelect: () => void } {
    const { platform, promptNative } = install;
    const state: InstallEntryState = platform === 'unsupported' ? 'hidden' : platform === 'installed' ? 'installed' : 'install';
    return {
        state,
        onSelect: () => {
            captureEvent('install_menu_clicked', { platform });
            if (platform === 'native') {
                void promptNative();
            } else {
                onShowSteps();
            }
        },
    };
}

/**
 * The "Install app" entry of the account menu. On Chromium the click replays
 * the browser's install dialog; elsewhere it opens InstallStepsDialog. Hidden
 * inside the installed app and on a desktop browser that cannot install.
 */
export default function InstallAppMenuItem({ install, onShowSteps, className = "cursor-pointer" }: InstallAppMenuItemProps) {
    const t = useTranslations("pwa.install");
    const { state, onSelect } = installAction(install, onShowSteps);
    if (state === 'hidden') return null;
    if (state === 'installed') {
        return (
            <DropdownMenuItem disabled className={className}>
                <Check className="mr-2 h-4 w-4" />
                {t("installed")}
            </DropdownMenuItem>
        );
    }

    return (
        <DropdownMenuItem className={className} onSelect={onSelect}>
            <Download className="mr-2 h-4 w-4" />
            {t("menu")}
        </DropdownMenuItem>
    );
}
