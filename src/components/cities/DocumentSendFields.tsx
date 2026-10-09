"use client"
import { useTranslations } from 'next-intl'
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"
import type { DocumentKind } from '@prisma/client'
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { DOCUMENT_KINDS, MINUTES_THRESHOLD_DAYS } from '@/lib/documents/settings'
import type { DocumentSendCards } from '@/lib/zod-schemas/administrativeBody'

interface DocumentSendFieldsProps<T extends FieldValues & { documentSendSettings: DocumentSendCards }> {
    form: UseFormReturn<T>
}

/**
 * The "Αποστολή Εγγράφων" section: one card per document, with its switch,
 * its To address and its CC list. The body form of the city and the page of
 * the body both edit the settings through it (#874).
 */
export function DocumentSendFields<T extends FieldValues & { documentSendSettings: DocumentSendCards }>({ form }: DocumentSendFieldsProps<T>) {
    const t = useTranslations('AdministrativeBodiesList')
    const path = (document: DocumentKind, field?: 'enabled' | 'to' | 'cc') =>
        (field ? `documentSendSettings.${document}.${field}` : `documentSendSettings.${document}`) as Path<T>

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-sm font-medium">{t('documentSends.title')}</h3>
                <p className="text-sm text-muted-foreground">{t('documentSends.description')}</p>
            </div>
            {DOCUMENT_KINDS.map((document) => {
                const enabled = form.watch(path(document, 'enabled'))
                // An address typed and then switched off still fails its check, so its field stays in view
                const addressError = form.getFieldState(path(document), form.formState).invalid
                return (
                    <div key={document} className="space-y-3 rounded-lg border p-3">
                        <FormField
                            control={form.control}
                            name={path(document, 'enabled')}
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    {/* The name and the switch share the first line; the description sits under the name */}
                                    <div className="flex items-center justify-between gap-4">
                                        <FormLabel className="text-sm font-medium">{t(`documentSends.documents.${document}.name`)}</FormLabel>
                                        <FormControl>
                                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                                        </FormControl>
                                    </div>
                                    <FormDescription>
                                        {t(`documentSends.documents.${document}.description`, { days: MINUTES_THRESHOLD_DAYS })}
                                    </FormDescription>
                                </FormItem>
                            )}
                        />
                        {/* The addresses show for a document that is on, where the schema requires a To address, and for one whose addresses fail their check */}
                        {(enabled || addressError) && (
                            <>
                                <FormField
                                    control={form.control}
                                    name={path(document, 'to')}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('documentSends.to')}</FormLabel>
                                            <FormControl>
                                                <Input {...field} type="email" placeholder={t('documentSends.toPlaceholder')} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={path(document, 'cc')}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('documentSends.cc')}</FormLabel>
                                            <FormControl>
                                                <Input {...field} type="text" placeholder={t('documentSends.ccPlaceholder')} />
                                            </FormControl>
                                            <FormDescription>{t('documentSends.ccDescription')}</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
