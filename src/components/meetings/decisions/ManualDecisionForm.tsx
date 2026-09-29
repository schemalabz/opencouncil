"use client";

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LinkOrDrop } from '@/components/ui/link-or-drop';
import { QuietButton } from '@/components/meetings/decisions/controls';
import { adaFromDiavgeiaUrl } from '@/lib/utils/ada';
import type { UploadConfig } from '@/types/upload';

export interface ManualDecisionEntry {
    pdfUrl: string;
    decisionNumber: string;
    title: string | null;
    protocolNumber: string | null;
}

const schema = z.object({
    pdfUrl: z.string().trim().regex(/^https?:\/\/\S+$/),
    decisionNumber: z.string().trim().min(1),
    title: z.string().trim(),
    protocolNumber: z.string().trim(),
});

/**
 * A decision that is not on Diavgeia: the clerk gives the PDF and the number
 * the table names it by. Nothing saves here — «Συνέχεια» opens the document
 * next to the subject first.
 */
export function ManualDecisionForm({ subjectLabel, uploadConfig, initial, onContinue, onUseAda, onBack, onClose }: {
    subjectLabel: string;
    uploadConfig: UploadConfig;
    initial: ManualDecisionEntry | null;
    onContinue: (entry: ManualDecisionEntry) => void;
    onUseAda: (ada: string) => void;
    onBack: () => void;
    /** Closes the panel. */
    onClose: () => void;
}) {
    const t = useTranslations('admin.decisionsPage');
    const { control, register, handleSubmit, watch, formState: { errors } } = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: {
            pdfUrl: initial?.pdfUrl ?? '',
            decisionNumber: initial?.decisionNumber ?? '',
            title: initial?.title ?? '',
            protocolNumber: initial?.protocolNumber ?? '',
        },
    });
    const pastedAda = adaFromDiavgeiaUrl(watch('pdfUrl'));

    return (
        <form
            className="space-y-3"
            onSubmit={handleSubmit(v => onContinue({
                pdfUrl: v.pdfUrl.trim(),
                decisionNumber: v.decisionNumber.trim(),
                title: v.title.trim() || null,
                protocolNumber: v.protocolNumber.trim() || null,
            }))}
        >
            <h3 className="text-[15px] font-semibold">{t('panel.manualTitle', { subject: subjectLabel })}</h3>
            <p className="max-w-xl text-[13px] text-muted-foreground">{t('panel.manualHint')}</p>
            <div className="grid max-w-xl gap-1">
                <Label htmlFor="manual-pdf" className="text-xs font-medium">{t('panel.manualPdfLabel')}</Label>
                {/* Typing reports through onChange; an upload sets the input
                    itself and reports only through onUrlChange. */}
                <Controller name="pdfUrl" control={control} render={({ field }) => (
                    <LinkOrDrop id="manual-pdf" value={field.value} onChange={e => field.onChange(e.target.value)}
                        onUrlChange={field.onChange} config={uploadConfig} accept="application/pdf,.pdf" />
                )} />
                {errors.pdfUrl && <p className="text-xs text-destructive">{t('panel.manualPdfRequired')}</p>}
                {pastedAda && (
                    <p className="text-xs">
                        {t('panel.manualDiavgeiaLink', { ada: pastedAda })}{' '}
                        <QuietButton onClick={() => onUseAda(pastedAda)}>{t('panel.manualUseAda')}</QuietButton>
                    </p>
                )}
            </div>
            <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                    <Label htmlFor="manual-number" className="text-xs font-medium">{t('panel.manualNumberLabel')}</Label>
                    <Input id="manual-number" placeholder={t('decisionNumberPlaceholder')} {...register('decisionNumber')} />
                    {errors.decisionNumber && <p className="text-xs text-destructive">{t('panel.manualNumberRequired')}</p>}
                </div>
                <div className="grid gap-1">
                    <Label htmlFor="manual-protocol" className="text-xs font-medium">{t('panel.manualProtocolLabel')}</Label>
                    <Input id="manual-protocol" {...register('protocolNumber')} />
                </div>
                <div className="grid gap-1 sm:col-span-2">
                    <Label htmlFor="manual-title" className="text-xs font-medium">{t('panel.manualTitleLabel')}</Label>
                    <Input id="manual-title" {...register('title')} />
                </div>
            </div>
            <div className="flex items-center gap-4">
                <Button type="submit" size="sm">{t('panel.manualContinue')}</Button>
                <QuietButton onClick={onBack}>{t('panel.backToList')}</QuietButton>
                <QuietButton onClick={onClose}>{t('panel.close')}</QuietButton>
            </div>
        </form>
    );
}
