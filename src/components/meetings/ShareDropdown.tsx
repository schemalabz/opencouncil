"use client";

import { useState, useEffect } from 'react';
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
import { CheckCircle, CopyIcon, Share, FileDown, Loader2, Instagram } from "lucide-react";
import { useVideo } from './VideoProvider';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useShare } from '@/contexts/ShareContext';
import { formatTimestamp, sortSubjectsBySpeakerContributionCount } from '@/lib/utils';
import { downloadFile } from '@/lib/export/meetings';
import { useToast } from '@/hooks/use-toast';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { STORY_TEMPLATES, type StoryTemplateId } from '@/components/og/story-template-meta';
import { renderStoryTemplate } from '@/components/og/story-templates';
import { getSubjectSections, SECTION_LIMITS } from '@/components/og/story-templates/sections';
import { renderStoryToBlob, resolveImageToDataUri } from '@/lib/export/storyImage';

// One UI button per story template. Order = STORY_TEMPLATES iteration order.
// Derived (not hand-listed) so adding a template to STORY_TEMPLATES surfaces it
// automatically without a parallel-array drift risk.
const STORY_VARIANTS: ReadonlyArray<StoryTemplateId> = Object.keys(STORY_TEMPLATES) as StoryTemplateId[];


interface ShareDropdownProps {
    meetingId: string;
    cityId: string;
    className?: string;
}

export default function ShareDropdown({ meetingId, cityId, className }: ShareDropdownProps) {
    const [url, setUrl] = useState('');
    const [includeTimestamp, setIncludeTimestamp] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);
    const { currentTime } = useVideo();
    const { isOpen, targetTimestamp, shouldTriggerCopy, closeShareDropdown, resetCopyTrigger } = useShare();
    const pathname = usePathname();
    const t = useTranslations();
    const { toast } = useToast();
    const [internalOpen, setInternalOpen] = useState(false);
    const { meeting, subjects, city } = useCouncilMeetingData();

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

    const errorToast = () => {
        toast({
            title: 'Αποτυχία λήψης',
            description: 'Δεν ήταν δυνατή η δημιουργία της εικόνας. Δοκίμασε ξανά.',
            variant: 'destructive',
        });
    };

    const downloadStory = async (template: StoryTemplateId) => {
        setDownloading(`story-${template}`);
        try {
            // Pre-resolve the city logo so the off-screen canvas isn't tainted by a
            // cross-origin DO Spaces fetch. Watermark uses same-origin paths.
            const cityLogoImage = await resolveImageToDataUri(city.logoImage);
            const sortedSubjects = sortSubjectsBySpeakerContributionCount(subjects);
            const element = renderStoryTemplate(template, {
                meetingName: meeting.name,
                meetingDate: new Date(meeting.dateTime),
                cityName: city.name_municipality,
                cityLogoImage,
                adminBodyName: meeting.administrativeBody?.name,
                totalSubjects: sortedSubjects.length,
                blackLogoSrc: '/logo.png',
                whiteLogoSrc: '/white-logo.png',
                ...getSubjectSections(sortedSubjects, SECTION_LIMITS),
            });
            const blob = await renderStoryToBlob(element, { width: 1080, height: 1920 });
            downloadFile(blob, `meeting-story-${template}-${meetingId}.png`);
        } catch (error) {
            console.error('Error generating story image:', error);
            errorToast();
        } finally {
            setDownloading(null);
        }
    };

    const downloadFeed = async () => {
        setDownloading('feed');
        const imageUrl = `${window.location.origin}/api/og?cityId=${cityId}&meetingId=${meetingId}&variant=feed`;
        try {
            const response = await fetch(imageUrl);
            if (!response.ok) {
                if (response.status === 429) {
                    toast({
                        title: 'Αποτυχία δημιουργίας εικόνας',
                        description: 'Δεν είναι διαθέσιμη αυτή τη στιγμή η δημιουργία εικόνων. Δοκίμασε ξανά αργότερα.',
                        variant: 'destructive',
                    });
                } else {
                    errorToast();
                }
                return;
            }
            const blob = await response.blob();
            downloadFile(blob, `meeting-feed-${meetingId}.png`);
        } catch (error) {
            console.error('Error downloading feed image:', error);
            errorToast();
        } finally {
            setDownloading(null);
        }
    };

    // Determine what's being shared based on the current path
    const getShareContext = () => {
        if (pathname.includes('/transcript')) {
            return 'την απομαγνητοφώνηση';
        } else if (pathname.includes('/statistics')) {
            return 'τα στατιστικά';
        } else if (pathname.includes('/subjects/')) {
            return 'αυτό το θέμα';
        } else if (pathname.includes('/highlights')) {
            return 'τα highlights';
        } else if (pathname.includes('/share')) {
            return 'τις επιλογές κοινοποίησης';
        } else if (pathname.includes('/settings')) {
            return 'τις ρυθμίσεις';
        } else if (pathname.includes('/admin')) {
            return 'τη σελίδα διαχείρισης';
        } else if (pathname.includes('/map')) {
            return 'τον χάρτη';
        } else {
            return 'τη συνεδρίαση';
        }
    };

    const shareContext = getShareContext();

    // Use a single controlled state - prioritize context state when active
    const dropdownOpen = isOpen || internalOpen;

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
                    className={`w-9 h-9 rounded-full hover:bg-accent transition-colors shrink-0 ${className || ''}`}
                    title="Κοινοποίηση"
                >
                    <Share className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 sm:w-96" align="end">
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">Κοινοποίηση</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            Μοιραστείτε {shareContext}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <div className="p-3 space-y-4">
                    {/* URL Input and Copy Button */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">
                            Σύνδεσμος
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
                                        <span className="text-xs">Αντιγράφηκε</span>
                                    </>
                                ) : (
                                    <>
                                        <CopyIcon className="w-3 h-3 mr-1" />
                                        <span className="text-xs">Αντιγραφή</span>
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
                                <span>Ξεκίνημα από το {formatTimestamp(targetTimestamp !== null ? targetTimestamp : currentTime)}</span>
                            </label>
                        </div>
                    )}
                </div>

                {!pathname.includes('/subjects/') && (
                    <>
                        <DropdownMenuSeparator />
                        <div className="p-3 space-y-2">
                            <label className="text-xs font-medium text-muted-foreground block">
                                Εξαγωγή Προεπισκόπησης ως Εικόνα
                            </label>

                            {/* Four Story variants (9:16) — one render per click. */}
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground pt-1">
                                Story (9:16)
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {STORY_VARIANTS.map((template) => {
                                    const key = `story-${template}`;
                                    const isDownloading = downloading === key;
                                    return (
                                        <Button
                                            key={template}
                                            onClick={() => downloadStory(template)}
                                            disabled={downloading !== null}
                                            variant="outline"
                                            size="sm"
                                            className="h-8 flex items-center gap-1.5"
                                        >
                                            {isDownloading ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <Instagram className="w-3 h-3" />
                                            )}
                                            <span className="text-xs">{STORY_TEMPLATES[template].name}</span>
                                        </Button>
                                    );
                                })}
                            </div>

                            {/* Post (1:1) — single click, single render. */}
                            <Button
                                onClick={() => downloadFeed()}
                                disabled={downloading !== null}
                                variant="outline"
                                size="sm"
                                className="w-full h-8 flex items-center gap-1.5"
                            >
                                {downloading === 'feed' ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    <FileDown className="w-3 h-3" />
                                )}
                                <span className="text-xs">Post</span>
                                <span className="text-[10px] text-muted-foreground">(1:1)</span>
                            </Button>
                        </div>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}