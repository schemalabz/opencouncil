'use client';

import { useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Copy, Loader2, Moon, Sun } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SUBJECT_EMBED_HEIGHT, subjectEmbedSnippet, subjectEmbedUrl, type SubjectEmbedMode, type SubjectEmbedTarget } from '@/lib/sharing/subjectEmbed';

export function SubjectEmbedDialog({ open, onOpenChange, target }: { open: boolean; onOpenChange: (open: boolean) => void; target: SubjectEmbedTarget }) {
    const t = useTranslations('sharing');
    const locale = useLocale();
    const fieldId = useId();
    const [mode, setMode] = useState<SubjectEmbedMode>('light');
    const [origin, setOrigin] = useState('');
    const [status, setStatus] = useState<'idle' | 'pending' | 'copied' | 'error'>('idle');
    useEffect(() => { if (open) { setOrigin(window.location.origin); setStatus('idle'); } }, [open]);
    useEffect(() => { setStatus('idle'); }, [mode, target.subjectId]);
    const url = origin ? subjectEmbedUrl(origin, locale, target, mode) : '';
    const snippet = url ? subjectEmbedSnippet(url, t('embedTitle')) : '';
    async function copy() {
        setStatus('pending');
        try { await navigator.clipboard.writeText(snippet); setStatus('copied'); }
        catch { setStatus('error'); }
    }
    return <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent align="start" className="justify-items-stretch rounded-2xl border-foreground/15 text-left [&>button]:right-2 [&>button]:top-2 [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center max-h-[92dvh] w-[calc(100%-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-[680px] sm:rounded-2xl">
            <DialogHeader className="w-full px-6 pb-5 pt-7 text-left sm:px-8">
                <DialogTitle className="pr-6 !text-left !text-xl !font-semibold tracking-tight">{t('embedSubject')}</DialogTitle>
                <DialogDescription className="pt-1 leading-relaxed">{t('embedDescription')}</DialogDescription>
            </DialogHeader>
            <div className="w-full border-y bg-muted/30 px-4 py-5 sm:px-8">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-medium text-muted-foreground">{t('preview')}</span>
                    <div role="group" aria-label={t('appearance')} className="flex rounded-full border bg-background p-1">
                        {(['light', 'dark'] as const).map(value => <Button key={value} variant="ghost" size="sm" className={`min-h-11 gap-2 rounded-full px-3 ${mode === value ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground'}`} aria-pressed={mode === value} onClick={() => setMode(value)}>
                            {value === 'light' ? <Sun className="size-4" /> : <Moon className="size-4" />}{t(value)}
                        </Button>)}
                    </div>
                </div>
                {open && url && <iframe src={url} title={t('embedTitle')} height={SUBJECT_EMBED_HEIGHT} className="w-full rounded-xl border bg-background" />}
            </div>
            <div className="w-full space-y-4 px-6 py-6 sm:px-8">
                <div className="space-y-2">
                    <label htmlFor={fieldId} className="text-xs font-medium text-muted-foreground">{t('embedCode')}</label>
                    <textarea id={fieldId} value={snippet} readOnly onFocus={event => event.target.select()} rows={3} className="w-full resize-none rounded-lg border bg-background p-3 font-mono text-xs leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
                <Button className="min-h-11 w-full gap-2 rounded-full bg-foreground font-semibold text-background hover:bg-foreground/90" onClick={copy} disabled={!snippet || status === 'pending'}>
                    {status === 'pending' ? <Loader2 className="size-4 animate-spin" /> : status === 'copied' ? <Check className="size-4" /> : <Copy className="size-4" />}{t(status === 'copied' ? 'embedCopied' : 'copyEmbed')}
                </Button>
                <p aria-live="polite" className={status === 'error' ? 'text-sm text-destructive' : 'sr-only'}>{status === 'error' ? t('embedCopyError') : status === 'copied' ? t('embedCopied') : ''}</p>
            </div>
        </DialogContent>
    </Dialog>;
}
