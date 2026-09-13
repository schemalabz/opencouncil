"use client"

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { LinkOrDrop } from '@/components/ui/link-or-drop';
import { diavgeiaDocUrl } from './pdfUrl';

/** What the form hands back: the document as the person described it. */
export interface ManualEntry {
    ada: string | null;
    pdfUrl: string;
    title: string | null;
    decisionNumber: string | null;
    protocolNumber: string | null;
}

interface ManualEntryFormProps {
    cityId: string;
    meetingId: string;
    subjectId: string;
    saving: boolean;
    onSubmit: (entry: ManualEntry) => void;
}

interface ValidationMessages {
    adaRequired: string;
    pdfUrlInvalid: string;
    numberRequired: string;
}

/**
 * The fields behind "more options" count only while that section is open, so
 * a value typed and then folded away neither blocks nor reaches the save.
 */
function buildSchema(messages: ValidationMessages, moreOpen: boolean) {
    return z.object({
        ada: z.string().trim(),
        pdfUrl: z.string().trim(),
        title: z.string().trim(),
        decisionNumber: z.string().trim(),
        protocolNumber: z.string().trim(),
    }).superRefine((values, ctx) => {
        const pdfUrl = moreOpen ? values.pdfUrl : '';
        const decisionNumber = moreOpen ? values.decisionNumber : '';
        if (!values.ada && !pdfUrl) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ada'], message: messages.adaRequired });
        }
        if (pdfUrl && !/^https?:\/\//.test(pdfUrl)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pdfUrl'], message: messages.pdfUrlInvalid });
        }
        // A document that is not on Diavgeia has no ΑΔΑ to stand in for its number,
        // and the table and the receipts show nothing else.
        if (!values.ada && pdfUrl && !decisionNumber) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['decisionNumber'], message: messages.numberRequired });
        }
    });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const EMPTY: FormValues = { ada: '', pdfUrl: '', title: '', decisionNumber: '', protocolNumber: '' };
const LABEL = 'text-xs font-normal text-muted-foreground';
const INPUT = 'h-9 text-sm';

/**
 * The fallback for a decision the poll never brought: an ΑΔΑ, and behind
 * "more options" the fields for a document that is not on Diavgeia at all.
 */
export function ManualEntryForm({ cityId, meetingId, subjectId, saving, onSubmit }: ManualEntryFormProps) {
    const t = useTranslations('admin.decisionsPage');
    const [moreOpen, setMoreOpen] = useState(false);
    const schema = useMemo(() => buildSchema({
        adaRequired: t('validation.adaRequired'),
        pdfUrlInvalid: t('validation.pdfUrlInvalid'),
        numberRequired: t('validation.numberRequired'),
    }, moreOpen), [t, moreOpen]);
    const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });
    const ada = form.watch('ada').trim();

    const submit = form.handleSubmit(values => {
        const extras = moreOpen ? values : EMPTY;
        onSubmit({
            ada: values.ada || null,
            pdfUrl: extras.pdfUrl || diavgeiaDocUrl(values.ada),
            title: extras.title || values.ada || null,
            decisionNumber: extras.decisionNumber || null,
            protocolNumber: extras.protocolNumber || null,
        });
    });

    return (
        <Form {...form}>
            <form onSubmit={submit} className="space-y-3">
                <FormField
                    control={form.control}
                    name="ada"
                    render={({ field }) => (
                        <FormItem className="space-y-1">
                            <FormLabel className={LABEL}>{t('adaLabel')} *</FormLabel>
                            <FormControl>
                                <Input {...field} placeholder={t('adaPlaceholder')} className={INPUT} />
                            </FormControl>
                            <FormMessage className="text-xs" />
                            {!moreOpen && ada && <p className="text-xs text-muted-foreground">{t('autoPdfHint', { ada })}</p>}
                        </FormItem>
                    )}
                />

                <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setMoreOpen(open => !open)}
                    aria-expanded={moreOpen}
                >
                    {moreOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {t('moreOptions')}
                </button>

                {moreOpen && (
                    <div className="space-y-3">
                        <FormField
                            control={form.control}
                            name="pdfUrl"
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    <FormLabel className={LABEL}>{t('pdfUrlLabel')}</FormLabel>
                                    <FormControl>
                                        <LinkOrDrop
                                            {...field}
                                            placeholder={t('pdfUrlPlaceholder')}
                                            onUrlChange={url => field.onChange(url)}
                                            config={{ cityId, identifier: `${meetingId}_${subjectId}`, suffix: 'decision' }}
                                            inputClassName={INPUT}
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    <FormLabel className={LABEL}>{t('titleLabel')}</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder={t('titlePlaceholder')} className={INPUT} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <FormField
                                control={form.control}
                                name="decisionNumber"
                                render={({ field }) => (
                                    <FormItem className="space-y-1">
                                        <FormLabel className={LABEL}>{t('decisionNumberLabel')}</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder={t('decisionNumberPlaceholder')} className={INPUT} />
                                        </FormControl>
                                        <FormMessage className="text-xs" />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="protocolNumber"
                                render={({ field }) => (
                                    <FormItem className="space-y-1">
                                        <FormLabel className={LABEL}>{t('protocolNumberLabel')}</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder={t('protocolNumberExample')} className={INPUT} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>
                )}

                <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={saving}>
                        {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        {t('save')}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
