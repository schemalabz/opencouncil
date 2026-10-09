"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ClipboardList, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { RosterEntry } from '@/lib/zod-schemas/bodyMembers';
import { ROSTER_TEXT_MAX_LENGTH } from '@/lib/zod-schemas/bodyMembers';

interface RosterImportDialogProps {
    cityId: string;
    bodyId: string;
}

async function errorOf(response: Response, fallback: string): Promise<string> {
    const data = await response.json().catch(() => null);
    return typeof data?.error === 'string' ? data.error : fallback;
}

/**
 * Import the members of the body from a pasted list (#829): the model reads
 * the list, the admin checks the names and the titles, and confirms. Two
 * steps, so a misread name never reaches the database unseen.
 */
export function RosterImportDialog({ cityId, bodyId }: RosterImportDialogProps) {
    const t = useTranslations('body');
    const router = useRouter();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [entries, setEntries] = useState<RosterEntry[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const base = `/api/cities/${cityId}/administrative-bodies/${bodyId}/members`;

    async function parse() {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`${base}/parse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            if (!response.ok) throw new Error(await errorOf(response, t('importParseFailed')));
            const data: { entries: RosterEntry[] } = await response.json();
            if (data.entries.length === 0) throw new Error(t('importNobodyFound'));
            setEntries(data.entries);
        } catch (parseError) {
            setError(parseError instanceof Error ? parseError.message : t('importParseFailed'));
        } finally {
            setBusy(false);
        }
    }

    async function confirm() {
        if (!entries || entries.length === 0) return;
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(base, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // No start date: the server starts the memberships where the
                // last membership of the body ended, or leaves the start open.
                body: JSON.stringify({ entries }),
            });
            if (!response.ok) throw new Error(await errorOf(response, t('importFailed')));
            const result: { created: number; joined: number; skipped: number } = await response.json();
            toast({ title: t('importDone'), description: t('importSummary', result) });
            setOpen(false);
            setText('');
            setEntries(null);
            router.refresh();
        } catch (importError) {
            setError(importError instanceof Error ? importError.message : t('importFailed'));
        } finally {
            setBusy(false);
        }
    }

    function reset(next: boolean) {
        setOpen(next);
        if (!next) {
            setEntries(null);
            setError(null);
        }
    }

    return (
        <Dialog open={open} onOpenChange={reset}>
            <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                    <ClipboardList className="mr-2 h-4 w-4" aria-hidden />
                    {t('importMembers')}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('importMembers')}</DialogTitle>
                    <DialogDescription>{entries ? t('importCheckIntro') : t('importIntro')}</DialogDescription>
                </DialogHeader>
                {entries === null ? (
                    <Textarea
                        value={text}
                        onChange={event => setText(event.target.value)}
                        placeholder={t('importPlaceholder')}
                        rows={12}
                        maxLength={ROSTER_TEXT_MAX_LENGTH}
                    />
                ) : (
                    <ul className="divide-y divide-border rounded-lg border">
                        {entries.map((entry, index) => (
                            <li key={`${entry.name}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">
                                        {entry.name}
                                        {entry.isHead && <span className="ml-2 rounded-full border px-1.5 text-[11px] text-muted-foreground">{t('importChair')}</span>}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground">
                                        {entry.name_en}{entry.roleName ? ` · ${entry.roleName}` : ''}
                                    </div>
                                </div>
                                <Button type="button" variant="ghost" size="sm" onClick={() => setEntries(entries.filter((_, i) => i !== index))} title={t('importRemoveRow')}>
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                    <span className="sr-only">{t('importRemoveRow')}</span>
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <DialogFooter className="gap-2 sm:gap-0">
                    {entries === null ? (
                        <Button type="button" onClick={parse} disabled={busy || text.trim().length === 0}>
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('importRead')}
                        </Button>
                    ) : (
                        <>
                            <Button type="button" variant="outline" onClick={() => setEntries(null)} disabled={busy}>
                                {t('importBack')}
                            </Button>
                            <Button type="button" onClick={confirm} disabled={busy || entries.length === 0}>
                                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('importConfirm', { count: entries.length })}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
