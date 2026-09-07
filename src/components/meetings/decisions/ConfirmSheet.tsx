"use client"

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { diavgeiaViewUrl, inlinePdfUrl } from './pdfUrl';
import { AIGeneratedBadge } from '@/components/AIGeneratedBadge';

interface ConfirmSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    action: 'assign' | 'link' | 'unlink' | 'dismiss' | 'inspect' | 'view' | 'reassign';
    /** Unlink of a decision with no backing candidate: data is lost permanently. */
    destructive: boolean;
    decisionTitle: string | null;
    decisionNumber: string | null;
    subjectName: string | null;
    pdfUrl: string;
    /** Links the header to the decision's page on Diavgeia. */
    ada: string | null;
    /** The subject's own description — the context for judging the match. */
    subjectDescription?: string | null;
    agendaItemTitle?: string | null;
    busy: boolean;
    onConfirm: () => void;
    /** Inspect mode: the confirm button assigns, and it needs a selected subject. */
    confirmDisabled?: boolean;
    /** Inspect mode: renders a dismiss button next to the confirm button. */
    onDismiss?: () => void;
    /** View mode: extraction results rendered in a second in-sheet tab. */
    extraContent?: React.ReactNode;
    /** Cross-meeting callers (the decisions overview) link to the meeting here. */
    meetingLink?: React.ReactNode;
    /** Reassign mode: names the subject that loses the decision. */
    holderName?: string | null;
}

/**
 * The commit gate for link-changing actions: the admin confirms while looking
 * at the document itself, not only at metadata. Inspect mode uses the same
 * surface read-first: the admin opens the document, then assigns or dismisses.
 */
export function ConfirmSheet({ open, onOpenChange, action, destructive, decisionTitle, decisionNumber, subjectName, pdfUrl, ada, subjectDescription, agendaItemTitle, busy, onConfirm, confirmDisabled, onDismiss, extraContent, meetingLink, holderName }: ConfirmSheetProps) {
    const t = useTranslations('admin.decisionsPage.sheet');
    const [pane, setPane] = useState<'document' | 'extraction'>('document');
    useEffect(() => { if (open) setPane('document'); }, [open]);
    const explain = action === 'inspect'
        ? (subjectName ? t('inspectExplain', { subject: subjectName }) : t('inspectNoSubject'))
        : t(`${action}Explain`, { subject: subjectName ?? '', holder: holderName ?? '' });
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle>{t(`${action}Title`)}</SheetTitle>
                    <SheetDescription>
                        {decisionNumber ? `${decisionNumber} — ` : ''}{decisionTitle ?? ''}
                        {action === 'view' && subjectName && <><br />{explain}</>}
                    </SheetDescription>
                    {agendaItemTitle?.trim() && (
                        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{t('agendaItemTitleLabel')}</span>{' '}
                            <span>{agendaItemTitle}</span>
                        </div>
                    )}
                    {subjectDescription && (
                        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{t('subjectDescriptionLabel')}</span>{' '}
                            <span>{subjectDescription}</span>
                            <AIGeneratedBadge className="mt-1 justify-end" />
                        </div>
                    )}
                    {(ada || meetingLink) && (
                        <div className="flex items-center gap-4">
                            {ada && (
                                <a
                                    href={diavgeiaViewUrl(ada)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                                >
                                    {t('viewOnDiavgeia')}
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            )}
                            {meetingLink}
                        </div>
                    )}
                </SheetHeader>
                {extraContent && (
                    <div className="flex gap-4 border-b text-sm">
                        <button
                            type="button"
                            onClick={() => setPane('document')}
                            className={`pb-2 -mb-px ${pane === 'document' ? 'font-semibold border-b-2 border-[#fc550a]' : 'text-muted-foreground'}`}
                        >
                            {t('tabDocument')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPane('extraction')}
                            className={`pb-2 -mb-px ${pane === 'extraction' ? 'font-semibold border-b-2 border-[#fc550a]' : 'text-muted-foreground'}`}
                        >
                            {t('tabExtraction')}
                        </button>
                    </div>
                )}
                {extraContent && pane === 'extraction' ? (
                    <div className="h-[60vh] min-h-[320px] shrink-0 overflow-y-auto rounded border p-3">{extraContent}</div>
                ) : (
                    <iframe title={t('documentTitle')} src={inlinePdfUrl(pdfUrl)} className="h-[60vh] min-h-[320px] w-full shrink-0 rounded border" />
                )}
                {action !== 'view' && (
                    <div className={`rounded-lg px-3 py-2.5 text-sm ${action === 'unlink' && destructive ? 'bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200' : 'bg-muted/60'}`}>
                        {explain}
                        {action === 'unlink' && (
                            <span className={destructive ? 'font-semibold' : undefined}>
                                {' '}{destructive ? t('unlinkDestructive') : t('unlinkReversible')}
                            </span>
                        )}
                    </div>
                )}
                <SheetFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t(action === 'view' ? 'close' : 'cancel')}</Button>
                    {onDismiss && (
                        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={onDismiss} disabled={busy}>
                            {t('dismissAction')}
                        </Button>
                    )}
                    {action !== 'view' && !(action === 'inspect' && confirmDisabled) && (
                        <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : action === 'inspect' ? t('assignAction') : t('confirm')}
                        </Button>
                    )}
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
