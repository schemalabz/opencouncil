"use client"
import { useState } from 'react'
import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog'
import { useValidationMessage, useZodResolver } from "@/hooks/useLocalizedValidation"
import { useForm } from "react-hook-form"
import type * as z from "zod"
import {
    administrativeBodyFormSchema,
    administrativeBodySchema,
    confirmConventionsRequestSchema,
    documentSendCardsFromSettings,
    documentSendSettingsFromCards,
    type AdministrativeBodyFormInput,
    type AdministrativeBodyFormOutput,
} from "@/lib/zod-schemas/administrativeBody"
import { DOCUMENT_KINDS, MINUTES_THRESHOLD_DAYS, type DocumentSendRule } from '@/lib/documents/settings'
import { Loader2, Pencil, Plus, Trash2, XCircle, Send, CheckCircle } from "lucide-react"
import type { AdministrativeBodyWithSettings } from '@/lib/db/types'
import type { DocumentKind } from '@prisma/client'
import { Switch } from "@/components/ui/switch"
import { TripleToggle } from "@/components/ui/triple-toggle"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
// @ts-ignore
import { toPhoneticLatin as toGreeklish } from 'greek-utils'
import InputWithDerivatives from '@/components/InputWithDerivatives'
import DecisionConventionsFields from './DecisionConventionsFields'
import type { DecisionConventions } from '@/lib/decisionConventions'
import { apiErrorMessage, formatValidationIssues, type FormattableIssue } from '@/lib/utils/validationIssues'


/** The messages of a nested field error, one per leaf, with the path below the field. */
function leafIssues(error: unknown, path: string[] = []): FormattableIssue[] {
    if (typeof error !== 'object' || error === null) return [];
    if ('message' in error && typeof error.message === 'string') return [{ path, message: error.message }];
    return Object.entries(error).flatMap(([key, child]) => key === 'ref' ? [] : leafIssues(child, [...path, key]));
}

/**
 * The error of the conventions field. FormMessage shows the message of the
 * field itself, and a record that fails holds its messages on its sub-fields.
 */
function ConventionsMessage({ error }: { error: unknown }) {
    const validationMessage = useValidationMessage()
    const issues = leafIssues(error).map(issue => ({ ...issue, message: validationMessage(issue.message) }))
    if (issues.length === 0) return null
    return (
        <p role="alert" className="whitespace-pre-line text-sm font-medium text-destructive">
            {formatValidationIssues(issues).join('\n')}
        </p>
    )
}

/** A body as the form edits it: an editor's read carries its document send settings. */
type EditableBody = AdministrativeBodyWithSettings & {
    documentSendSettings?: Array<DocumentSendRule & { document: DocumentKind }>;
};

interface AdministrativeBodiesListProps {
    cityId: string;
    bodies: EditableBody[];
    onUpdate: () => void;
}

function getFormDefaults(body?: EditableBody | null): AdministrativeBodyFormInput {
    return {
        name: body?.name || "",
        name_en: body?.name_en || "",
        type: body?.type || "council",
        youtubeChannelUrl: body?.youtubeChannelUrl || "",
        place: body?.place || "",
        notificationBehavior: body?.notificationBehavior || "NOTIFICATIONS_APPROVAL",
        showUnreviewedTranscript: body?.showUnreviewedTranscript ?? true,
        diavgeiaUnitIds: body?.diavgeiaUnitIds?.join(', ') || "",
        decisionConventions: body?.decisionConventions ?? null,
        documentSendSettings: documentSendCardsFromSettings(body?.documentSendSettings),
    };
}

export default function AdministrativeBodiesList({ cityId, bodies, onUpdate }: AdministrativeBodiesListProps) {
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isConfirmingConventions, setIsConfirmingConventions] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [editingBody, setEditingBody] = useState<EditableBody | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [bodyToDelete, setBodyToDelete] = useState<EditableBody | null>(null)
    const t = useTranslations('AdministrativeBodiesList')
    const { data: session } = useSession()
    const isSuperAdmin = session?.user?.isSuperAdmin ?? false
    const validationMessage = useValidationMessage()

    const form = useForm({
        resolver: useZodResolver(administrativeBodyFormSchema),
        defaultValues: getFormDefaults(editingBody),
    })

    async function onSubmit(values: AdministrativeBodyFormOutput) {
        setIsSubmitting(true)
        setFormError(null)

        const url = editingBody
            ? `/api/cities/${cityId}/administrative-bodies/${editingBody.id}`
            : `/api/cities/${cityId}/administrative-bodies`
        const method = editingBody ? 'PUT' : 'POST'

        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                // The conventions are written by their own Confirm button, so
                // this body leaves them out.
                body: JSON.stringify({
                    name: values.name,
                    name_en: values.name_en,
                    type: values.type,
                    youtubeChannelUrl: values.youtubeChannelUrl,
                    place: values.place,
                    notificationBehavior: values.notificationBehavior,
                    showUnreviewedTranscript: values.showUnreviewedTranscript,
                    diavgeiaUnitIds: values.diavgeiaUnitIds,
                    documentSendSettings: documentSendSettingsFromCards(values.documentSendSettings),
                } satisfies z.input<typeof administrativeBodySchema>),
            })

            if (response.ok) {
                onUpdate()
                setEditingBody(null)
                form.reset(getFormDefaults())
                setIsDialogOpen(false)
            } else {
                const errorData = await response.json()
                throw new Error(apiErrorMessage(errorData, response.status, t('failedToSave'), validationMessage))
            }
        } catch (error) {
            console.error(t('failedToSave'), error)
            setFormError(error instanceof Error ? error.message : t('unexpectedError'))
        } finally {
            setIsSubmitting(false)
        }
    }

    /** Confirming stamps who confirmed and stops derivation flagging the body. */
    const handleConfirmConventions = async (conventions: DecisionConventions) => {
        if (!editingBody) return
        setIsConfirmingConventions(true)
        setFormError(null)
        try {
            const response = await fetch(`/api/cities/${cityId}/administrative-bodies/${editingBody.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmConventions: true, decisionConventions: conventions } satisfies z.input<typeof confirmConventionsRequestSchema>),
            })
            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(apiErrorMessage(errorData, response.status, t('failedToSave'), validationMessage))
            }
            const updated: AdministrativeBodyWithSettings = await response.json()
            form.setValue('decisionConventions', updated.decisionConventions)
            setEditingBody({ ...editingBody, decisionConventions: updated.decisionConventions })
            onUpdate()
        } catch (error) {
            console.error(t('failedToSave'), error)
            setFormError(error instanceof Error ? error.message : t('unexpectedError'))
        } finally {
            setIsConfirmingConventions(false)
        }
    }

    const handleDelete = async (id: string) => {
        try {
            const response = await fetch(`/api/cities/${cityId}/administrative-bodies/${id}`, {
                method: 'DELETE',
            })

            if (response.ok) {
                setBodyToDelete(null)
                onUpdate()
            } else {
                const errorData = await response.json()
                throw new Error(apiErrorMessage(errorData, response.status, t('failedToDelete'), validationMessage))
            }
        } catch (error) {
            console.error(t('failedToDelete'), error)
            alert(error instanceof Error ? error.message : t('unexpectedError'))
        }
    }

    return (
        <div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingBody ? t('editBody') : t('addBody')}
                        </DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                            {formError && (
                                <div className="text-red-500 mb-4">{formError}</div>
                            )}
                            <InputWithDerivatives
                                baseName="name"
                                basePlaceholder={t('namePlaceholder')}
                                baseDescription={t('nameDescription')}
                                derivatives={[
                                    {
                                        name: 'name_en',
                                        calculate: (baseValue) => toGreeklish(baseValue),
                                        placeholder: t('nameEnPlaceholder'),
                                        description: t('nameEnDescription'),
                                    },
                                ]}
                                form={form}
                            />
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('type')}</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={t('selectType')} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="council">{t('types.council')}</SelectItem>
                                                <SelectItem value="committee">{t('types.committee')}</SelectItem>
                                                <SelectItem value="community">{t('types.community')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormDescription>
                                            {t('typeDescription')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="youtubeChannelUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('youtubeChannelUrl')}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                placeholder={t('youtubeChannelUrlPlaceholder')}
                                                type="url"
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {t('youtubeChannelUrlDescription')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="place"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('place')}</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder={t('placePlaceholder')} />
                                        </FormControl>
                                        <FormDescription>
                                            {t('placeDescription')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="space-y-3">
                                <div>
                                    <h3 className="text-sm font-medium">{t('documentSends.title')}</h3>
                                    <p className="text-sm text-muted-foreground">{t('documentSends.description')}</p>
                                </div>
                                {DOCUMENT_KINDS.map((document) => {
                                    const enabled = form.watch(`documentSendSettings.${document}.enabled`)
                                    // An address typed and then switched off still fails its check, so its field stays in view
                                    const addressError = form.formState.errors.documentSendSettings?.[document]
                                    return (
                                        <div key={document} className="space-y-3 rounded-lg border p-3">
                                            <FormField
                                                control={form.control}
                                                name={`documentSendSettings.${document}.enabled`}
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
                                                        name={`documentSendSettings.${document}.to`}
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
                                                        name={`documentSendSettings.${document}.cc`}
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
                            <FormField
                                control={form.control}
                                name="notificationBehavior"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('notificationBehavior')}</FormLabel>
                                        <FormControl>
                                            <TripleToggle
                                                value={field.value}
                                                onChange={field.onChange}
                                                options={[
                                                    {
                                                        value: 'NOTIFICATIONS_DISABLED',
                                                        label: t('notificationBehaviorOptions.disabled'),
                                                        icon: <XCircle className="h-3 w-3" />
                                                    },
                                                    {
                                                        value: 'NOTIFICATIONS_AUTO',
                                                        label: t('notificationBehaviorOptions.auto'),
                                                        icon: <Send className="h-3 w-3" />
                                                    },
                                                    {
                                                        value: 'NOTIFICATIONS_APPROVAL',
                                                        label: t('notificationBehaviorOptions.approval'),
                                                        icon: <CheckCircle className="h-3 w-3" />
                                                    }
                                                ]}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {t('notificationBehaviorDescription')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="showUnreviewedTranscript"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                        <div className="space-y-0.5">
                                            <FormLabel>{t('showUnreviewedTranscript')}</FormLabel>
                                            <FormDescription>
                                                {t('showUnreviewedTranscriptDescription')}
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="diavgeiaUnitIds"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('diavgeiaUnitIds')}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                placeholder={t('diavgeiaUnitIdsPlaceholder')}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {t('diavgeiaUnitIdsDescription')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {editingBody && (
                                <FormField
                                    control={form.control}
                                    name="decisionConventions"
                                    render={({ field, fieldState }) => (
                                        <FormItem>
                                            <DecisionConventionsFields
                                                key={editingBody.id}
                                                value={field.value}
                                                onChange={field.onChange}
                                                onConfirm={handleConfirmConventions}
                                                confirming={isConfirmingConventions}
                                            />
                                            <ConventionsMessage error={fieldState.error} />
                                        </FormItem>
                                    )}
                                />
                            )}
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {t('submitting')}
                                    </>
                                ) : (
                                    editingBody ? t('update') : t('create')
                                )}
                            </Button>
                        </form>
                    </Form>
                </DialogContent>

            {/* A divided list, not a card each: this already sits inside the form's
                own section card, and a card per body nested a third frame around
                two lines of text. */}
            <div className="overflow-hidden rounded-[8px] border border-border">
                <div className="flex items-center justify-end border-b border-border bg-muted/40 px-2 py-1.5">
                    <DialogTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 rounded-[6px] px-2 text-xs"
                            onClick={(e) => {
                                e.preventDefault();
                                setEditingBody(null)
                                form.reset(getFormDefaults())
                                setIsDialogOpen(true)
                            }}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            {t('addNew')}
                        </Button>
                    </DialogTrigger>
                </div>
                <ul className="divide-y divide-border">
                    {bodies.map((body) => (
                        <li key={body.id} className="flex items-center gap-2 px-3 py-2">
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm">{body.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {t(`types.${body.type.toLowerCase()}`)} · {body.name_en}
                                </span>
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 rounded-[6px] text-muted-foreground"
                                aria-label={t('editBody')}
                                onClick={(e) => {
                                    e.preventDefault();
                                    setEditingBody(body)
                                    form.reset(getFormDefaults(body))
                                    setIsDialogOpen(true)
                                }}
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {isSuperAdmin && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 rounded-[6px] text-muted-foreground hover:text-destructive"
                                    aria-label={t('delete')}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setBodyToDelete(body)
                                    }}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
            </Dialog>
            <ConfirmDeleteDialog
                open={bodyToDelete !== null}
                onOpenChange={(open) => !open && setBodyToDelete(null)}
                title={t('deleteBody')}
                description={t('confirmDelete')}
                itemName={bodyToDelete?.name ?? ''}
                onConfirm={async () => {
                    if (bodyToDelete) await handleDelete(bodyToDelete.id)
                }}
            />
        </div>
    )
} 
