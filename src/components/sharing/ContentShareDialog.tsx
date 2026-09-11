'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Check, Copy, Instagram, Link2, Loader2, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { StorySharePanel } from './StorySharePanel';
import { cn } from '@/lib/utils';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    url: string;
    sourceText: string;
    copyTextLabel: string;
    children: React.ReactNode;
    storyImageUrl?: string;
    initialMode?: 'link' | 'story';
}

export function ContentShareDialog({ open, onOpenChange, title, description, url, sourceText, copyTextLabel, children, storyImageUrl, initialMode = 'link' }: Props) {
    const t = useTranslations('sharing');
    const fieldId = useId();
    const [pending, setPending] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const [nativeShare, setNativeShare] = useState(false);
    const [mode, setMode] = useState(initialMode);
    useEffect(() => { setNativeShare(typeof navigator.share === 'function'); }, []);
    useEffect(() => { setCopied(null); setError(false); setMode(initialMode); }, [open, url, initialMode]);
    const showStory = mode === 'story' && !!storyImageUrl;

    async function copy(kind: 'link' | 'text') {
        setPending(kind); setError(false); setCopied(null);
        try {
            await navigator.clipboard.writeText(kind === 'link' ? url : `${sourceText}\n\n${url}`);
            setCopied(kind);
        } catch { setError(true); }
        finally { setPending(null); }
    }
    async function share() {
        setError(false); setPending('share');
        try { await navigator.share({ title, text: sourceText, url }); }
        catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setError(true); }
        finally { setPending(null); }
    }
    const shareDisabled = !url || pending !== null;
    const shareButton = <Button className="min-h-11 gap-2 rounded-full bg-[hsl(var(--orange-deep))] font-semibold text-white hover:bg-[color-mix(in_srgb,hsl(var(--orange-deep)),black_8%)] hover:opacity-100" disabled={shareDisabled} onClick={nativeShare ? share : undefined}>
        {pending === 'share' ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}{t('share')}
    </Button>;
    const destinations = [
        { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}` },
        { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
        { label: t('email'), href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${sourceText}\n\n${url}`)}` },
    ];

    function statusIcon(kind: 'link' | 'text') {
        if (pending === kind) return <Loader2 className="size-4 animate-spin" />;
        if (copied === kind) return <Check className="size-4" />;
        return kind === 'link' ? <Link2 className="size-4" /> : <Copy className="size-4" />;
    }

    return <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent align="start" className={cn('grid-cols-1 justify-items-stretch rounded-2xl border-foreground/15 text-left [&>button]:right-2 [&>button]:top-2 [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] gap-0 overflow-y-auto p-0 sm:max-w-[620px] sm:rounded-2xl', showStory && 'sm:max-w-[760px]')}>
            <DialogHeader className={cn('w-full px-6 pb-5 pt-7 text-left sm:px-8', showStory && '!space-y-0 !px-4 !py-3 sm:!px-6')}>
                <div className="flex items-center gap-2">
                    {showStory && <Button variant="ghost" size="icon" onClick={() => setMode('link')} className="size-11 shrink-0 rounded-full text-muted-foreground" aria-label={t('storyBack')}><ArrowLeft className="size-4" /></Button>}
                    <DialogTitle className="pr-8 !text-left !text-xl !font-semibold tracking-tight">{showStory ? t('storyTitle') : title}</DialogTitle>
                </div>
                <DialogDescription className={showStory ? 'sr-only' : 'pt-1 leading-relaxed'}>{showStory ? t('storyDescription') : description}</DialogDescription>
            </DialogHeader>
            {showStory ? open && <StorySharePanel key={storyImageUrl} imageUrl={storyImageUrl!} url={url} /> : <>
            <div className="w-full border-y bg-muted/30 px-6 py-6 sm:px-8">{children}</div>
            <div className="w-full space-y-4 px-6 py-6 sm:px-8">
                <div className="grid gap-2 sm:grid-cols-2">
                    <Button className="min-h-11 gap-2 rounded-full font-semibold" variant="outline" disabled={shareDisabled} onClick={() => copy('link')}>
                        {statusIcon('link')}{copied === 'link' ? t('copied') : t('copyLink')}
                    </Button>
                    {nativeShare ? shareButton : <DropdownMenu>
                        <DropdownMenuTrigger asChild>{shareButton}</DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44 rounded-xl p-1.5">
                            {destinations.map(destination => <DropdownMenuItem key={destination.label} asChild className="min-h-11 rounded-lg">
                                <a href={destination.href} target="_blank" rel="noopener noreferrer">{destination.label}</a>
                            </DropdownMenuItem>)}
                        </DropdownMenuContent>
                    </DropdownMenu>}
                </div>
                {storyImageUrl && <Button variant="outline" className="min-h-11 w-full gap-2 rounded-full font-medium" onClick={() => setMode('story')}><Instagram className="size-4" />{t('storyTitle')}</Button>}
                <Button className="h-auto min-h-11 w-full gap-2 whitespace-normal rounded-full px-3 py-2.5 text-sm font-normal text-muted-foreground hover:text-foreground" variant="ghost" disabled={shareDisabled} onClick={() => copy('text')}>
                    {statusIcon('text')}{copied === 'text' ? t('copied') : copyTextLabel}
                </Button>
                {error && <div className="space-y-1.5">
                    <label htmlFor={fieldId} className="text-xs font-medium text-muted-foreground">{t('link')}</label>
                    <Input id={fieldId} value={url} readOnly onFocus={event => event.target.select()} className="h-11 rounded-lg text-xs" />
                </div>}
                <p aria-live="polite" className={error ? 'text-sm text-destructive' : 'sr-only'}>{error ? t('copyError') : copied ? t('copied') : ''}</p>
            </div>
            </>}
        </DialogContent>
    </Dialog>;
}
