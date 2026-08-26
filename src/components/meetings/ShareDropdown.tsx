"use client";

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from "../ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { CheckCircle, CopyIcon, Share, Instagram } from "lucide-react";
import { useVideo } from './VideoProvider';
import { usePathname } from 'next/navigation';
import { useShare } from '@/contexts/ShareContext';
import { formatTimestamp } from '@/lib/utils';
import StoryTemplatePickerDialog from './StoryTemplatePickerDialog';
import posthog from 'posthog-js';


interface ShareDropdownProps {
    meetingId: string;
    cityId: string;
    className?: string;
}

/**
 * Maps a page context to its translation key. The description is a full
 * sentence per context rather than "Share" + a noun, because the noun needs
 * case agreement in Greek and Serbian.
 */
const SHARE_CONTEXT_KEYS: Record<string, string> = {
    transcript: 'shareTranscript',
    statistics: 'shareStatistics',
    subject: 'shareSubject',
    highlights: 'shareHighlights',
    share: 'shareShare',
    settings: 'shareSettings',
    admin: 'shareAdmin',
    map: 'shareMap',
    meeting: 'shareMeeting',
};

export default function ShareDropdown({ meetingId, cityId, className }: ShareDropdownProps) {
    const t = useTranslations('ShareDropdown');
    const [url, setUrl] = useState('');
    const [includeTimestamp, setIncludeTimestamp] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const { currentTime } = useVideo();
    const { isOpen, targetTimestamp, shouldTriggerCopy, closeShareDropdown, resetCopyTrigger } = useShare();
    const pathname = usePathname();
    const [internalOpen, setInternalOpen] = useState(false);
    const [storyPickerOpen, setStoryPickerOpen] = useState(false);

    useEffect(() => {
        setUrl(window.location.href);
    }, [pathname]);

    // Handle opening with a specific timestamp from context
    useEffect(() => {
        if (isOpen && targetTimestamp !== null) {
            setIncludeTimestamp(true);
        }
    }, [isOpen, targetTimestamp]);

    // Handle automatic copy trigger
    useEffect(() => {
        if (shouldTriggerCopy && isOpen && targetTimestamp !== null) {
            // When auto-copying, targetTimestamp is always provided by context
            const currentUrl = window.location.href;
            const urlObj = new URL(currentUrl);
            urlObj.searchParams.delete('t');
            urlObj.searchParams.set('t', Math.floor(targetTimestamp).toString());
            const shareableUrl = urlObj.toString();

            navigator.clipboard.writeText(shareableUrl).then(() => {
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 3000);
            }).catch(console.error);

            resetCopyTrigger();
        }
    }, [shouldTriggerCopy, isOpen, targetTimestamp, resetCopyTrigger]);

    const getShareableUrl = () => {
        const effectiveTime = targetTimestamp !== null ? targetTimestamp : currentTime;
        if (includeTimestamp && effectiveTime > 0) {
            // Parse the current URL and remove any existing timestamp parameters
            const urlObj = new URL(url);
            urlObj.searchParams.delete('t'); // Remove existing timestamp parameter
            urlObj.searchParams.set('t', Math.floor(effectiveTime).toString()); // Add new timestamp
            return urlObj.toString();
        }
        return url;
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(getShareableUrl());
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
    };

    const openStoryPicker = () => {
        // Close the dropdown when opening the dialog so they don't stack.
        if (isOpen) {
            closeShareDropdown();
        } else {
            setInternalOpen(false);
        }
        setStoryPickerOpen(true);
    };

    // Determine what's being shared based on the current path
    const getShareContextKey = () => {
        if (pathname.includes('/transcript')) {
            return 'transcript';
        } else if (pathname.includes('/statistics')) {
            return 'statistics';
        } else if (pathname.includes('/subjects/')) {
            return 'subject';
        } else if (pathname.includes('/highlights')) {
            return 'highlights';
        } else if (pathname.includes('/share')) {
            return 'share';
        } else if (pathname.includes('/settings')) {
            return 'settings';
        } else if (pathname.includes('/admin')) {
            return 'admin';
        } else if (pathname.includes('/map')) {
            return 'map';
        } else {
            return 'meeting';
        }
    };

    const shareContextKey = getShareContextKey();
    const shareContext = t(SHARE_CONTEXT_KEYS[shareContextKey]);

    // Use a single controlled state - prioritize context state when active
    const dropdownOpen = isOpen || internalOpen;

    // Each open counts as one share intent, whether triggered by the button
    // or programmatically from the transcript context menu. Capture strictly
    // on the closed→open transition: shareContextKey is in the deps, so a
    // client-side navigation while the menu stays open would otherwise
    // re-fire for the same open.
    const prevDropdownOpen = useRef(false);
    useEffect(() => {
        const justOpened = dropdownOpen && !prevDropdownOpen.current;
        prevDropdownOpen.current = dropdownOpen;
        if (!justOpened || !posthog.__loaded) return;
        posthog.capture('share_clicked', {
            city_id: cityId,
            meeting_id: meetingId,
            page: shareContextKey,
        });
    }, [dropdownOpen, cityId, meetingId, shareContextKey]);

    const handleOpenChange = (open: boolean) => {
        if (open) {
            // Opening - only allow internal state if not controlled by context
            if (!isOpen) {
                setInternalOpen(true);
            }
        } else {
            // Closing - close whichever state is active
            if (isOpen) {
                closeShareDropdown();
            } else {
                setInternalOpen(false);
            }
        }
    };

    return (
        <DropdownMenu open={dropdownOpen} onOpenChange={handleOpenChange}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={`h-9 w-9 lg:w-auto lg:px-3 gap-1.5 rounded-full text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground shrink-0 ${className || ''}`}
                    title={t('title')}
                >
                    <Share className="h-4 w-4 shrink-0" />
                    <span className="hidden text-sm lg:inline">{t('title')}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 sm:w-96" align="end">
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{t('title')}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {shareContext}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <div className="p-3 space-y-4">
                    {/* URL Input and Copy Button */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">
                            {t('link')}
                        </label>
                        <div className="flex gap-2">
                            <Input
                                value={getShareableUrl()}
                                readOnly
                                className="flex-grow text-xs font-mono h-9"
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                            />
                            <Button
                                onClick={copyToClipboard}
                                variant={copySuccess ? "default" : "outline"}
                                disabled={copySuccess}
                                className="flex-shrink-0 min-w-[80px] h-9"
                            >
                                {copySuccess ? (
                                    <>
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        <span className="text-xs">{t('copied')}</span>
                                    </>
                                ) : (
                                    <>
                                        <CopyIcon className="w-3 h-3 mr-1" />
                                        <span className="text-xs">{t('copy')}</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Timestamp Checkbox */}
                    {(currentTime > 0 || targetTimestamp !== null) && (
                        <div className="flex items-center space-x-2 p-2 rounded-md">
                            <Checkbox
                                id="timestamp"
                                checked={includeTimestamp}
                                onCheckedChange={(checked) => setIncludeTimestamp(checked as boolean)}
                            />
                            <label
                                htmlFor="timestamp"
                                className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1"
                            >
                                <span>{t('startFrom', { timestamp: formatTimestamp(targetTimestamp !== null ? targetTimestamp : currentTime) })}</span>
                            </label>
                        </div>
                    )}
                </div>

                {!pathname.includes('/subjects/') && (
                    <>
                        <DropdownMenuSeparator />
                        <div className="p-3 space-y-2">
                            <label className="text-xs font-medium text-muted-foreground block">
                                {t('exportPreviewAsImage')}
                            </label>

                            <Button
                                onClick={openStoryPicker}
                                variant="outline"
                                size="sm"
                                className="w-full h-8 flex items-center gap-1.5"
                            >
                                <Instagram className="w-3 h-3" />
                                <span className="text-xs">Story</span>
                                <span className="text-[10px] text-muted-foreground">(9:16)</span>
                            </Button>
                        </div>
                    </>
                )}
            </DropdownMenuContent>

            <StoryTemplatePickerDialog
                open={storyPickerOpen}
                onOpenChange={setStoryPickerOpen}
                meetingId={meetingId}
            />
        </DropdownMenu>
    );
}