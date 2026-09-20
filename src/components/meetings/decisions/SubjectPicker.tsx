"use client";

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PANEL_SHELL, QuietButton } from '@/components/meetings/decisions/controls';
import { RecordRow } from '@/components/meetings/decisions/RecordRow';

export interface SubjectPickerSubject {
    id: string;
    /**
     * Always begins with the Greek article «το», same contract as
     * `LinkPanel`'s `subjectLabel` — this value feeds the same `panel.linkTo`
     * key, so a label that starts any other way produces ungrammatical Greek.
     */
    label: string;
    /** See `LinkPanel`'s prop of the same name: a numbered subject fits
     * "Σύνδεση με το θέμα 30" on a button, a named one does not. */
    hasAgendaNumber: boolean;
    name: string;
    /** The resolver's own proposal for this decision. */
    likely: boolean;
    /** This subject already has a proposed decision awaiting Yes/No in the table. */
    waitingAnswer: boolean;
}

export interface SubjectPickerProps {
    decisionNumber: string;
    subjects: SubjectPickerSubject[];
    query: string;
    onQueryChange: (q: string) => void;
    onPick: (subjectId: string) => void;
    onDismiss: () => void;
    onClose: () => void;
    saving: boolean;
}

/**
 * `LinkPanel`, inverted: there a person picks a decision for a subject, here
 * they pick a subject for a decision. Same layout, spacing and control
 * vocabulary, so the two read as one system.
 *
 * The list holds only the subjects still without a decision, so a finished
 * meeting leaves it empty — the typical case for the ψήφισμα this picker is
 * most often opened for. An empty list therefore says why it is empty and
 * points at the answer that remains, rather than counting zero subjects.
 */
export function SubjectPicker({
    decisionNumber,
    subjects,
    query,
    onQueryChange,
    onPick,
    onDismiss,
    onClose,
    saving,
}: SubjectPickerProps) {
    const t = useTranslations('admin.decisionsPage');
    const searching = query.trim().length > 0;

    return (
        <div className={PANEL_SHELL}>
            <h3 className="text-[15px] font-semibold">{t('picker.title', { number: decisionNumber })}</h3>
            <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
                {subjects.length > 0
                    ? t('picker.hint', { n: subjects.length })
                    : searching
                        ? t('picker.noMatch', { query: query.trim() })
                        : t('picker.noneWaiting')}
            </p>
            <div className="mt-3 space-y-3">
                {/* Nothing to search through, and nothing typed: a search box
                    here would be the only control on the list, and it could
                    never return a row. */}
                {(subjects.length > 0 || searching) && (
                    <Input
                        value={query}
                        onChange={e => onQueryChange(e.target.value)}
                        placeholder={t('panel.searchPlaceholder')}
                        className="max-w-xs"
                    />
                )}
                <div className="space-y-1.5">
                    {subjects.map(subject => (
                        <RecordRow
                            key={subject.id}
                            // A named subject's label is «το θέμα «{name}»» — the very
                            // name the row already shows. Only a numbered subject gets
                            // a lead, so the row never prints its subject twice.
                            lead={subject.hasAgendaNumber
                                ? <span className="shrink-0 text-sm font-medium">{subject.label}</span>
                                : undefined}
                            title={subject.name}
                            meta={subject.likely || subject.waitingAnswer
                                ? (
                                    <>
                                        {subject.likely && <span className="font-semibold text-green-700">{t('attention.likelyMatch')}</span>}
                                        {subject.likely && subject.waitingAnswer && ' · '}
                                        {subject.waitingAnswer && t('picker.waitingAnswer')}
                                    </>
                                )
                                : null}
                            action={(
                                <Button
                                    size="sm"
                                    variant={subject.likely ? 'default' : 'outline'}
                                    disabled={saving}
                                    aria-label={t('panel.linkNumberTo', { number: decisionNumber, subject: subject.label })}
                                    onClick={() => onPick(subject.id)}
                                >
                                    {subject.hasAgendaNumber ? t('panel.linkTo', { subject: subject.label }) : t('panel.link')}
                                </Button>
                            )}
                        />
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    <QuietButton onClick={onDismiss} disabled={saving}>{t('attention.notThisMeeting')}</QuietButton>
                    <span aria-hidden>&middot;</span>
                    <QuietButton onClick={onClose} disabled={saving}>{t('panel.close')}</QuietButton>
                </div>
            </div>
        </div>
    );
}
