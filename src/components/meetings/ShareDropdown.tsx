"use client";

import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Check, Link2, Loader2, Share2, Instagram, Code2, ChevronRight } from 'lucide-react';
import { useVideo } from './VideoProvider';
import { usePathname, useParams } from 'next/navigation';
import { useShare } from '@/contexts/ShareContext';
import { formatTimestamp } from '@/lib/formatters/time';
import { getLocalizedName } from '@/lib/formatters/name';
import { localizeText } from '@/lib/serbian';
import StoryTemplatePickerDialog from './StoryTemplatePickerDialog';
import posthog from 'posthog-js';
import { SubjectEmbedDialog } from '@/components/embed/SubjectEmbedDialog';
import { validSourceId } from '@/lib/sharing/excerptSelector';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { SubjectShareDialog } from '@/components/sharing/SubjectShareDialog';


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

function buildShareUrl(source: string, timestamp: number | null, subjectPage: boolean) {
    if (!source) return '';
    const result = new URL(source);
    result.searchParams.delete('t');
    if (timestamp !== null) result.searchParams.set('t', Math.floor(timestamp).toString());
    if (subjectPage) {
        result.searchParams.delete('contribution');
        if (result.hash.startsWith('#contribution-')) result.hash = '';
    }
    return result.href;
}

export default function ShareDropdown({ meetingId, cityId, className }: ShareDropdownProps) {
    const t = useTranslations('ShareDropdown');
    const tSharing = useTranslations('sharing');
    const locale = useLocale();
    const fallbackId = useId();
    const params = useParams();
    const { meeting, subjects } = useCouncilMeetingData();
    const subjectId = meeting.released && validSourceId(params.subjectId) ? params.subjectId : null;
    const subject = subjects.find(item => item.id === subjectId);
    const [url, setUrl] = useState('');
    const [includeTimestamp, setIncludeTimestamp] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [pending, setPending] = useState<'copy' | 'share' | null>(null);
    const [error, setError] = useState(false);
    const [nativeShare, setNativeShare] = useState(false);
    const { currentTime } = useVideo();
    const { isOpen, targetTimestamp, shouldTriggerCopy, closeShareDropdown, resetCopyTrigger } = useShare();
    const pathname = usePathname();
    const [internalOpen, setInternalOpen] = useState(false);
    const [storyPickerOpen, setStoryPickerOpen] = useState(false);
    const [embedOpen, setEmbedOpen] = useState(false);
    const [subjectStoryOpen, setSubjectStoryOpen] = useState(false);
    const dropdownOpen = isOpen || internalOpen;
    const subjectPage = pathname.includes('/subjects/');
    const effectiveTime = targetTimestamp ?? currentTime;
    const shareableUrl = buildShareUrl(url, includeTimestamp ? effectiveTime : null, subjectPage);
    const shareTitle = subject ? localizeText(subject.name, locale) : getLocalizedName(meeting, locale);
    const actionDisabled = !shareableUrl || pending !== null;
    const operationRef = useRef(0);
    const itemClass = 'min-h-11 cursor-pointer gap-3 rounded-xl px-3 text-sm font-medium';

    useEffect(() => {
        operationRef.current += 1;
        setPending(null);
        if (!dropdownOpen) return;
        setUrl(window.location.href);
        setIncludeTimestamp(targetTimestamp !== null || new URL(window.location.href).searchParams.has('t'));
        setCopySuccess(false);
        setError(false);
        return () => { operationRef.current += 1; };
    }, [dropdownOpen, pathname, targetTimestamp]);
    useEffect(() => { setNativeShare(typeof navigator.share === 'function'); }, []);

    const copyUrl = useCallback(async (link: string) => {
        const operation = ++operationRef.current;
        setPending('copy'); setCopySuccess(false); setError(false);
        try {
            await navigator.clipboard.writeText(link);
            if (operation === operationRef.current) setCopySuccess(true);
        } catch { if (operation === operationRef.current) setError(true); }
        finally { if (operation === operationRef.current) setPending(null); }
    }, []);

    // Handle automatic copy trigger
    useEffect(() => {
        if (shouldTriggerCopy && isOpen && targetTimestamp !== null) {
            void copyUrl(buildShareUrl(window.location.href, targetTimestamp, subjectPage));
            resetCopyTrigger();
        }
    }, [shouldTriggerCopy, isOpen, targetTimestamp, resetCopyTrigger, copyUrl, subjectPage]);

    const closeMenu = () => {
        operationRef.current += 1;
        setPending(null);
        closeShareDropdown();
        setInternalOpen(false);
    };
    const openDialog = (setOpen: (open: boolean) => void) => {
        closeMenu();
        // Let the menu release focus before opening the dialog.
        window.setTimeout(() => setOpen(true), 0);
    };
    const share = async () => {
        const operation = ++operationRef.current;
        setPending('share'); setError(false);
        try {
            await navigator.share({ title: shareTitle, url: shareableUrl });
            if (operation === operationRef.current) closeMenu();
        } catch (error) {
            if (operation === operationRef.current && !(error instanceof Error && error.name === 'AbortError')) setError(true);
        } finally { if (operation === operationRef.current) setPending(null); }
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
            closeMenu();
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
                    <Share2 className="h-4 w-4 shrink-0" />
                    <span className="hidden text-sm lg:inline">{t('title')}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl p-2 shadow-xl shadow-black/10" align="end" sideOffset={8} collisionPadding={12}>
                <DropdownMenuLabel className="px-3 pb-3 pt-2 font-normal">
                    <p className="text-base font-semibold leading-6 text-foreground">{subject ? tSharing('shareSubject') : t('title')}</p>
                    <p className="mt-1 line-clamp-2 break-words text-sm leading-5 text-muted-foreground">{subject ? shareTitle : shareContext}</p>
                </DropdownMenuLabel>

                {(currentTime > 0 || targetTimestamp !== null || includeTimestamp) && <DropdownMenuCheckboxItem
                    className="mb-2 min-h-11 cursor-pointer rounded-xl pr-3 text-sm"
                    checked={includeTimestamp}
                    onCheckedChange={checked => { setIncludeTimestamp(checked); setCopySuccess(false); setError(false); }}
                >{t('startFrom', { timestamp: formatTimestamp(effectiveTime) })}</DropdownMenuCheckboxItem>}

                <DropdownMenuItem
                    className="min-h-12 cursor-pointer justify-center gap-2 rounded-full bg-[hsl(var(--orange-deep))] px-4 text-sm font-semibold text-white focus:bg-[color-mix(in_srgb,hsl(var(--orange-deep)),black_8%)] focus:text-white"
                    disabled={actionDisabled}
                    onSelect={event => { event.preventDefault(); void copyUrl(shareableUrl); }}
                >
                    {pending === 'copy' ? <Loader2 className="size-4 animate-spin" /> : copySuccess ? <Check className="size-4" /> : <Link2 className="size-4" />}
                    {tSharing(copySuccess ? 'copied' : 'copyLink')}
                </DropdownMenuItem>

                <div className="mt-2">
                    {nativeShare ? <DropdownMenuItem className={itemClass} disabled={actionDisabled} onSelect={event => { event.preventDefault(); void share(); }}>
                        {pending === 'share' ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4 text-muted-foreground" />}{tSharing('share')}
                    </DropdownMenuItem> : <DropdownMenuSub>
                        <DropdownMenuSubTrigger className={itemClass} disabled={actionDisabled}><Share2 className="size-4 text-muted-foreground" />{tSharing('share')}</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-44 rounded-xl p-1.5">
                            {[
                                { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${shareTitle}\n${shareableUrl}`)}` },
                                { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareableUrl)}` },
                                { label: tSharing('email'), href: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareableUrl)}` },
                            ].map(destination => <DropdownMenuItem key={destination.label} asChild className="min-h-11 cursor-pointer rounded-lg px-3">
                                <a href={destination.href} target="_blank" rel="noopener noreferrer">{destination.label}</a>
                            </DropdownMenuItem>)}
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>}
                    {(subject || !subjectPage) && <DropdownMenuItem className={itemClass} onSelect={() => openDialog(subject ? setSubjectStoryOpen : setStoryPickerOpen)}>
                        <Instagram className="size-4 text-muted-foreground" />{tSharing('storyTitle')}<ChevronRight className="ml-auto size-4 text-muted-foreground/60" />
                    </DropdownMenuItem>}
                    {subjectId && <>
                        <DropdownMenuSeparator className="mx-3 my-1" />
                        <DropdownMenuItem className={`${itemClass} text-muted-foreground`} onSelect={() => openDialog(setEmbedOpen)}>
                            <Code2 className="size-4" />{tSharing('embedSubject')}<ChevronRight className="ml-auto size-4 text-muted-foreground/60" />
                        </DropdownMenuItem>
                    </>}
                </div>

                {error && <div className="space-y-2 px-3 pb-2 pt-3">
                    <p className="text-xs leading-5 text-destructive" role="alert">{tSharing('copyError')}</p>
                    <label htmlFor={fallbackId} className="sr-only">{tSharing('link')}</label>
                    <Input id={fallbackId} value={shareableUrl} readOnly autoFocus onFocus={event => event.target.select()} className="h-11 rounded-lg text-xs" />
                </div>}
                <p role="status" className="sr-only">{copySuccess ? tSharing('copied') : ''}</p>
            </DropdownMenuContent>

            <StoryTemplatePickerDialog
                open={storyPickerOpen}
                onOpenChange={setStoryPickerOpen}
                meetingId={meetingId}
            />
            {subjectId && <SubjectEmbedDialog key={subjectId} open={embedOpen} onOpenChange={setEmbedOpen} target={{ cityId, meetingId, subjectId }} />}
            {subject && <SubjectShareDialog key={`story-${subject.id}`} open={subjectStoryOpen} onOpenChange={setSubjectStoryOpen} cityId={cityId} meetingId={meetingId} subject={subject} />}
        </DropdownMenu>
    );
}
