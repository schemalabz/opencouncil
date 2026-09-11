'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Download, ImageIcon, Link2, Loader2, Maximize2, RotateCcw, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ReadyImage { source: string; file: File; preview: string; canShare: boolean }

export function StorySharePanel({ imageUrl, url }: { imageUrl: string; url: string }) {
    const t = useTranslations('sharing');
    const inputId = useId();
    const [image, setImage] = useState<ReadyImage | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [imageError, setImageError] = useState<'source-changed' | 'unavailable' | 'failed' | null>(null);
    const [copyError, setCopyError] = useState(false);
    const [shareError, setShareError] = useState(false);
    const [copied, setCopied] = useState(false);
    const [pending, setPending] = useState<'copy' | 'share' | null>(null);
    const ready = image?.source === imageUrl ? image : null;

    useEffect(() => {
        const controller = new AbortController();
        let preview: string | undefined;
        setImage(null); setImageError(null); setShareError(false); setCopied(false); setCopyError(false);
        async function prepare() {
            try {
                const response = await fetch(imageUrl, { signal: controller.signal, cache: 'no-store' });
                if (controller.signal.aborted) return;
                if (!response.ok) {
                    setImageError(response.status === 409 ? 'source-changed' : response.status === 404 ? 'unavailable' : 'failed');
                    return;
                }
                const blob = await response.blob();
                if (controller.signal.aborted) return;
                if (blob.type !== 'image/png' || !blob.size) throw new Error('Invalid Story image');
                const file = new File([blob], 'opencouncil-story.png', { type: 'image/png' });
                preview = URL.createObjectURL(file);
                let canShare = false;
                try { canShare = typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }) === true; } catch { /* Save image remains available. */ }
                setImage({ source: imageUrl, file, preview, canShare });
            } catch { if (!controller.signal.aborted) setImageError('failed'); }
        }
        void prepare();
        return () => { controller.abort(); if (preview) URL.revokeObjectURL(preview); };
    }, [imageUrl, attempt]);

    async function copyLink() {
        setPending('copy'); setCopyError(false); setCopied(false);
        try { await navigator.clipboard.writeText(url); setCopied(true); }
        catch { setCopyError(true); }
        finally { setPending(null); }
    }

    async function shareImage() {
        if (!ready) return;
        setPending('share'); setShareError(false);
        // Prepare before the tap so file sharing retains browser user activation.
        // Send only the PNG: extra text/URLs can change the available destinations.
        try { await navigator.share({ files: [ready.file] }); }
        catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setShareError(true); }
        finally { setPending(null); }
    }

    const primaryClass = 'border-transparent bg-[hsl(var(--orange-deep))] text-white hover:bg-[color-mix(in_srgb,hsl(var(--orange-deep)),black_8%)] hover:text-white hover:opacity-100';
    const actionClass = 'min-h-12 w-full gap-2 rounded-full px-4 font-semibold shadow-none';
    const saveImage = ready && <a href={ready.preview} download={ready.file.name}><Download className="size-4" aria-hidden />{t('storySave')}</a>;
    const downloadOnly = !!ready && !ready.canShare;
    return <div className="grid w-full border-t sm:grid-cols-[1fr_1fr]">
        <div className="flex min-w-0 flex-col items-center justify-center gap-2 bg-muted/30 px-6 py-4 sm:p-7">
            <div className="relative flex aspect-[9/16] w-[min(48vw,18dvh)] items-center justify-center overflow-hidden rounded-md bg-[#faf8f5] shadow-sm ring-1 ring-black/10 sm:w-full sm:max-w-[min(300px,33dvh)]">
                {ready ? <a href={ready.preview} target="_blank" rel="noopener noreferrer" aria-label={t('storyViewImage')} className="group block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[hsl(var(--orange-deep))]">
                    {/* The preview and the shared file are the same generated PNG. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ready.preview} alt={t('storyPreviewAlt')} width={1080} height={1920} className="block h-full w-full object-contain" />
                    <span className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full bg-background/95 text-foreground shadow-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100"><Maximize2 className="size-3.5" aria-hidden /></span>
                </a> : <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-5 text-center text-[#70665c]" role="status">
                    {imageError ? <ImageIcon className="size-6" aria-hidden /> : <Loader2 className="size-6 animate-spin" aria-hidden />}
                    <p className="text-sm leading-5">{t(imageError === 'source-changed' ? 'sourceChangedTitle' : imageError === 'unavailable' ? 'unavailableTitle' : imageError ? 'storyImageError' : 'storyPreparing')}</p>
                    {imageError === 'failed' && <Button variant="ghost" size="sm" className="min-h-11 gap-2 rounded-full" onClick={() => setAttempt(value => value + 1)}><RotateCcw className="size-3.5" />{t('storyRetry')}</Button>}
                </div>}
            </div>
            <p className="text-xs text-muted-foreground">{t('storyPreviewCaption')}</p>
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-4 px-5 py-5 sm:gap-5 sm:px-7 sm:py-8">
            <ol className="space-y-5 sm:space-y-7">
                <li className="space-y-2.5">
                    <div className="flex items-center gap-2.5 text-sm font-semibold"><span aria-hidden className={cn('flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground', copied && 'bg-[hsl(var(--orange)/0.1)] text-[hsl(var(--orange-deep))] dark:text-[hsl(var(--orange))]')}>{copied ? <Check className="size-3.5" /> : '1'}</span>{t('storyStepLink')}</div>
                    <Button variant="outline" className={cn(actionClass, !copied && primaryClass)} disabled={!url || pending !== null} onClick={copyLink}>
                        {pending === 'copy' ? <Loader2 className="size-4 animate-spin" /> : copied ? <Check className="size-4" /> : <Link2 className="size-4" />}{t(copied ? 'storyLinkCopied' : 'copyLink')}
                    </Button>
                    <p className="text-sm leading-5 text-muted-foreground">{t('storyLinkHint')}</p>
                </li>
                <li className="space-y-2.5">
                    <div className="flex items-center gap-2.5 text-sm font-semibold"><span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">2</span>{t('storyStepImage')}</div>
                    {downloadOnly ? <Button asChild variant="outline" className={cn(actionClass, copied && primaryClass)}>{saveImage}</Button>
                    : <Button variant="outline" className={cn(actionClass, copied && primaryClass)} disabled={!ready || pending !== null} onClick={shareImage}>
                        {pending === 'share' ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}{t('storyShareImage')}
                    </Button>}
                    <p className="text-sm leading-5 text-muted-foreground">{t(downloadOnly ? 'storySaveHint' : 'storyShareHint')}</p>
                </li>
            </ol>
            {ready?.canShare && <div className="border-t pt-2"><Button asChild variant="ghost" className="min-h-11 w-full gap-2 rounded-full text-sm font-normal text-muted-foreground">{saveImage}</Button></div>}
            {copyError && <div className="space-y-2">
                <label htmlFor={inputId} className="text-xs text-muted-foreground">{t('link')}</label>
                <Input id={inputId} value={url} readOnly onFocus={event => event.target.select()} className="h-11 rounded-lg text-xs" />
            </div>}
            <p role="status" className={copyError || shareError ? 'text-sm leading-5 text-destructive' : 'sr-only'}>{copyError ? t('copyError') : shareError ? t('storyShareError') : copied ? t('storyLinkCopied') : ''}</p>
        </div>
    </div>;
}
