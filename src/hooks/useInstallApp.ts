'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { captureEvent } from '@/lib/analytics/capture';
import { detectInstallPlatform, isStandaloneDisplay, type BeforeInstallPromptEvent, type InstallPlatform } from '@/lib/pwa/install';

// Chromium fires `beforeinstallprompt` once, whenever it decides the site is
// installable, and the event must be kept to replay it later from a click.
// The listener is registered when this module loads, not when a component
// mounts, so the event is not lost to a menu that has not opened yet.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedFromThisTab = false;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((subscriber) => subscriber());

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (event) => {
        // Keeps Chromium's own mini-infobar away; the menu entry replays it.
        event.preventDefault();
        deferredPrompt = event as BeforeInstallPromptEvent;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        installedFromThisTab = true;
        captureEvent('app_installed');
        notify();
    });
}

const subscribe = (subscriber: () => void) => {
    subscribers.add(subscriber);
    return () => { subscribers.delete(subscriber); };
};
const hasDeferredPrompt = () => deferredPrompt !== null;
const wasInstalledFromThisTab = () => installedFromThisTab;
const serverSnapshot = () => false;

// Chromium lists the site itself when the manifest names it under
// `related_applications` (src/app/manifest.ts) and the app is installed.
// Other browsers have no such API and resolve to "not installed".
async function isInstalledElsewhere(): Promise<boolean> {
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
    if (!nav.getInstalledRelatedApps) return false;
    try {
        return (await nav.getInstalledRelatedApps()).length > 0;
    } catch {
        return false;
    }
}

export interface InstallApp {
    platform: InstallPlatform;
    /** Replays the browser's install dialog. Only meaningful when `platform` is `native`. */
    promptNative: () => Promise<void>;
}

/**
 * How this browser can install the app, resolved after mount so the server
 * and the first client render agree (`unsupported` hides the entry until then).
 */
export function useInstallApp(): InstallApp {
    const native = useSyncExternalStore(subscribe, hasDeferredPrompt, serverSnapshot);
    const installedHere = useSyncExternalStore(subscribe, wasInstalledFromThisTab, serverSnapshot);
    const [detected, setDetected] = useState<InstallPlatform>('unsupported');

    useEffect(() => {
        if (isStandaloneDisplay(window)) {
            setDetected('installed');
            return;
        }
        setDetected(detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints));
        let current = true;
        isInstalledElsewhere().then((installed) => {
            if (current && installed) setDetected('installed');
        });
        return () => { current = false; };
    }, []);

    const promptNative = useCallback(async () => {
        const event = deferredPrompt;
        if (!event) return;
        deferredPrompt = null;
        notify();
        await event.prompt();
        const { outcome } = await event.userChoice;
        captureEvent('install_prompt_answered', { outcome });
    }, []);

    const platform: InstallPlatform = detected === 'installed' || installedHere
        ? 'installed'
        : native ? 'native' : detected;
    return { platform, promptNative };
}
