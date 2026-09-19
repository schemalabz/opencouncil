"use client";

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QuietButton } from '@/components/meetings/decisions/controls';

/** What the page needs to link a decision nobody found for us. */
export interface AdaEntry {
    ada: string;
    decisionNumber: string | null;
}

const schema = z.object({
    ada: z.string().trim().min(1),
    decisionNumber: z.string().trim(),
});

/**
 * The way in when the automatic search came back with nothing.
 *
 * Two fields only: the ΑΔΑ, which is the one thing a person cannot look up
 * from here, and the number if they happen to have it. Everything else about
 * the decision — the document, the title, the vote — we fetch ourselves, and
 * asking for it would read as work the person has to do.
 */
export function AdaForm({ subjectLabel, hasAgendaNumber, saving, onSubmit, onBack }: {
    subjectLabel: string;
    /** See `LinkPanel`'s prop of the same name: picks the submit button's
     * copy so a named subject does not blow the button out with its full
     * label. */
    hasAgendaNumber: boolean;
    saving: boolean;
    onSubmit: (entry: AdaEntry) => void;
    onBack: () => void;
}) {
    const t = useTranslations('admin.decisionsPage');
    const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { ada: '', decisionNumber: '' },
    });

    return (
        <form
            className="space-y-3"
            onSubmit={handleSubmit(values => onSubmit({
                ada: values.ada.trim(),
                decisionNumber: values.decisionNumber.trim() || null,
            }))}
        >
            <h3 className="text-[15px] font-semibold">{t('panel.adaTitle', { subject: subjectLabel })}</h3>
            <p className="max-w-xl text-[13px] text-muted-foreground">{t('panel.adaHint')}</p>
            {/* Both fields span the same three rows of the parent grid — label,
                input, note — so a label that wraps at some width grows that row
                for both cells and the two inputs keep one baseline. Sized
                columns alone let the longer label wrap and push its input a
                line below its neighbour. */}
            <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-[220px_200px] sm:grid-rows-[auto_auto_auto] sm:gap-y-1">
                <div className="grid gap-1 sm:row-span-3 sm:grid-rows-subgrid">
                    <Label htmlFor="ada-field" className="text-xs font-medium">{t('adaLabel')}</Label>
                    <Input id="ada-field" placeholder={t('adaPlaceholder')} {...register('ada')} />
                    {errors.ada && <p className="text-xs text-destructive">{t('validation.adaRequired')}</p>}
                </div>
                <div className="grid gap-1 sm:row-span-3 sm:grid-rows-subgrid">
                    <Label htmlFor="number-field" className="text-xs font-medium">{t('panel.numberOptional')}</Label>
                    <Input id="number-field" placeholder={t('decisionNumberPlaceholder')} {...register('decisionNumber')} />
                    <p className="text-xs text-muted-foreground">{t('panel.numberOptionalHint')}</p>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <Button type="submit" size="sm" disabled={saving}>
                    {hasAgendaNumber ? t('panel.linkTo', { subject: subjectLabel }) : t('panel.link')}
                </Button>
                <QuietButton onClick={onBack} disabled={saving}>{t('panel.backToList')}</QuietButton>
            </div>
        </form>
    );
}
