"use client";

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QuietButton } from '@/components/meetings/decisions/controls';
import { normalizeAda } from '@/lib/utils/ada';
import { diavgeiaViewUrl } from '@/components/meetings/decisions/pdfUrl';

export type AdaLookupState =
    | { kind: 'idle' }
    /** A poll of this meeting is running and this panel did not start it. */
    | { kind: 'blocked' }
    | { kind: 'searching'; ada: string; taskId: string }
    | { kind: 'found'; ada: string; candidateId: string; number: string; organizationLabel: string | null }
    | { kind: 'notFound'; ada: string }
    /** Diavgeia did not answer the poll. */
    | { kind: 'error'; ada: string }
    /** Diavgeia has the document, but it is not a decision of a collective body. */
    | { kind: 'notADecision'; ada: string }
    /** The search itself did not finish: the poll did not start, failed, or its outcome could not be read.
     * `cause` is the reason sentence when the panel's own catch produced one — `null` when the poll ran
     * but the outcome itself could not be turned into a result. */
    | { kind: 'failed'; ada: string; cause: string | null }
    | { kind: 'linkedElsewhere'; ada: string; label: string };

/**
 * The way to a decision the automatic search did not offer: the poll looks the
 * ΑΔΑ up on Diavgeia, and a found document opens next to the subject before
 * anything is linked. Nothing here writes.
 */
export function AdaLookupStep({ subjectLabel, noCandidates, state, onSearch, onOpenFound, onManual, onBack, onClose }: {
    subjectLabel: string;
    /** No free candidate exists: the step opens with a note that says so. */
    noCandidates: boolean;
    state: AdaLookupState;
    /** Receives the normalized ΑΔΑ. */
    onSearch: (ada: string) => void;
    onOpenFound: (candidateId: string) => void;
    onManual: () => void;
    /** `null` hides «Πίσω στη λίστα». */
    onBack: (() => void) | null;
    /** Closes the panel. Enabled during a search, which can take minutes. */
    onClose: () => void;
}) {
    const t = useTranslations('admin.decisionsPage');
    const [value, setValue] = useState('ada' in state ? state.ada : '');
    const [formatError, setFormatError] = useState(false);
    // An outcome names the ΑΔΑ it answers; show that one in the field.
    useEffect(() => { if ('ada' in state) setValue(state.ada); }, [state]);

    const busy = state.kind === 'searching' || state.kind === 'blocked';
    const submit = () => {
        const ada = normalizeAda(value);
        setFormatError(ada === null);
        if (ada) onSearch(ada);
    };

    return (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); submit(); }}>
            <h3 className="text-[15px] font-semibold">{t('panel.adaTitle', { subject: subjectLabel })}</h3>
            {noCandidates && <p className="max-w-xl text-sm">{t('panel.noCandidatesNote')}</p>}
            <p className="max-w-xl text-[13px] text-muted-foreground">{t('panel.adaHintLookup')}</p>
            <div className="grid max-w-xs gap-1">
                <Label htmlFor="ada-field" className="text-xs font-medium">{t('adaLabel')}</Label>
                <Input id="ada-field" value={value} disabled={busy} placeholder={t('adaPlaceholder')}
                    onChange={e => { setValue(e.target.value); setFormatError(false); }} />
                {formatError && <p className="text-xs text-destructive">{t('panel.adaFormatError')}</p>}
            </div>
            {state.kind === 'searching' && (
                <p className="flex max-w-xl items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />{t('panel.adaSearching')}
                </p>
            )}
            {state.kind === 'blocked' && <p className="max-w-xl text-sm text-muted-foreground">{t('panel.adaBlocked')}</p>}
            {state.kind === 'found' && (
                <p className="text-sm">
                    {t('panel.adaFound', { number: state.number })}{' '}
                    <QuietButton onClick={() => onOpenFound(state.candidateId)}>{t('panel.open')}</QuietButton>
                </p>
            )}
            {state.kind === 'notFound' && <p className="max-w-xl text-sm">{t('panel.adaNotFound', { ada: state.ada })}</p>}
            {state.kind === 'notADecision' && (
                <p className="max-w-xl text-sm">
                    {t('panel.adaNotADecision', { ada: state.ada })}{' '}
                    <a
                        href={diavgeiaViewUrl(state.ada)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline underline-offset-[3px]"
                    >
                        {t('sheet.viewOnDiavgeia')}
                        <ExternalLink className="h-3 w-3" />
                    </a>
                </p>
            )}
            {state.kind === 'error' && <p className="max-w-xl text-sm">{t('panel.adaError', { ada: state.ada })}</p>}
            {state.kind === 'failed' && (
                <p className="max-w-xl text-sm">
                    {t('panel.adaSearchFailed', { ada: state.ada })}{state.cause !== null && ` ${state.cause}`}
                </p>
            )}
            {state.kind === 'linkedElsewhere' && (
                <p className="max-w-xl text-sm">{t('panel.adaLinkedElsewhere', { ada: state.ada, label: state.label })}</p>
            )}
            <div className="flex flex-wrap items-center gap-4">
                <Button type="submit" size="sm" disabled={busy}>
                    {state.kind === 'error' || state.kind === 'failed' ? t('panel.adaRetry') : t('panel.adaSearch')}
                </Button>
                <QuietButton onClick={onManual}>{t('panel.addManually')}</QuietButton>
                {onBack && <QuietButton onClick={onBack}>{t('panel.backToList')}</QuietButton>}
                <QuietButton onClick={onClose}>{t('panel.close')}</QuietButton>
            </div>
        </form>
    );
}
