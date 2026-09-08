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
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Loader2, Pencil, Plus, Trash2, XCircle, Send, CheckCircle } from "lucide-react"
import { AdministrativeBodyType, NotificationBehavior } from '@prisma/client'
import { Switch } from "@/components/ui/switch"
import { TripleToggle } from "@/components/ui/triple-toggle"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
// @ts-ignore
import { toPhoneticLatin as toGreeklish } from 'greek-utils'
import InputWithDerivatives from '@/components/InputWithDerivatives'

const formSchema = z.object({
    name: z.string().min(2, {
        message: "Name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "Name (English) must be at least 2 characters.",
    }),
    type: z.enum(['council', 'committee', 'community']),
    youtubeChannelUrl: z.union([
        z.string().url({
            message: "Must be a valid URL.",
        }),
        z.literal('')
    ]).optional().transform(val => val === '' ? undefined : val),
    contactEmailPrimary: z.union([
        z.string().email({ message: "Must be a valid email address" }),
        z.literal('')
    ]).optional().transform(val => val === '' ? undefined : val),
    contactEmailsCC: z.string().optional().refine(val => {
        if (!val || val.trim() === '') return true;
        const emails = val.split(',').map(e => e.trim()).filter(e => e !== '');
        const emailSchema = z.string().email();
        return emails.every(email => emailSchema.safeParse(email).success);
    }, { message: "All entries must be valid email addresses" }),
    notificationBehavior: z.enum(['NOTIFICATIONS_DISABLED', 'NOTIFICATIONS_AUTO', 'NOTIFICATIONS_APPROVAL']),
    showUnreviewedTranscript: z.boolean(),
    diavgeiaUnitIds: z.string().optional().transform(val => val === '' ? undefined : val),
})

interface AdministrativeBody {
    id: string;
    name: string;
    name_en: string;
    type: AdministrativeBodyType;
    youtubeChannelUrl?: string | null;
    contactEmails?: string[];
    notificationBehavior?: NotificationBehavior | null;
    showUnreviewedTranscript?: boolean;
    diavgeiaUnitIds?: string[];
}

interface AdministrativeBodiesListProps {
    cityId: string;
    bodies: AdministrativeBody[];
    onUpdate: () => void;
}

function getFormDefaults(body?: AdministrativeBody | null): z.infer<typeof formSchema> {
    return {
        name: body?.name || "",
        name_en: body?.name_en || "",
        type: body?.type || "council",
        youtubeChannelUrl: body?.youtubeChannelUrl || "",
        contactEmailPrimary: body?.contactEmails?.[0] || "",
        contactEmailsCC: body?.contactEmails?.slice(1).join(', ') || "",
        notificationBehavior: body?.notificationBehavior || "NOTIFICATIONS_APPROVAL",
        showUnreviewedTranscript: body?.showUnreviewedTranscript ?? true,
        diavgeiaUnitIds: body?.diavgeiaUnitIds?.join(', ') || "",
    };
}

export default function AdministrativeBodiesList({ cityId, bodies, onUpdate }: AdministrativeBodiesListProps) {
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [editingBody, setEditingBody] = useState<AdministrativeBody | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const t = useTranslations('AdministrativeBodiesList')

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: getFormDefaults(editingBody),
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true)
        setFormError(null)

        const url = editingBody
            ? `/api/cities/${cityId}/administrative-bodies/${editingBody.id}`
            : `/api/cities/${cityId}/administrative-bodies`
        const method = editingBody ? 'PUT' : 'POST'

        try {
            // Combine primary + CC emails into a single array for API
            const contactEmailsArray: string[] = [];
            if (values.contactEmailPrimary) {
                contactEmailsArray.push(values.contactEmailPrimary);
            }
            if (values.contactEmailsCC) {
                const ccEmails = values.contactEmailsCC.split(',').map(e => e.trim()).filter(e => e !== '');
                contactEmailsArray.push(...ccEmails);
            }

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...values,
                    contactEmailPrimary: undefined,
                    contactEmailsCC: undefined,
                    contactEmails: contactEmailsArray,
                }),
            })

            if (response.ok) {
                onUpdate()
                setEditingBody(null)
                form.reset(getFormDefaults())
                setIsDialogOpen(false)
            } else {
                const errorData = await response.json()
                throw new Error(errorData.message || t('failedToSave'))
            }
        } catch (error) {
            console.error(t('failedToSave'), error)
            setFormError(error instanceof Error ? error.message : t('unexpectedError'))
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm(t('confirmDelete'))) return

        try {
            const response = await fetch(`/api/cities/${cityId}/administrative-bodies/${id}`, {
                method: 'DELETE',
            })

            if (response.ok) {
                onUpdate()
            } else {
                const errorData = await response.json()
                throw new Error(errorData.message || t('failedToDelete'))
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
                                name="contactEmailPrimary"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('contactEmailPrimary')}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                placeholder={t('contactEmailPrimaryPlaceholder')}
                                                type="email"
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {t('contactEmailPrimaryDescription')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="contactEmailsCC"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('contactEmailsCC')}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                placeholder={t('contactEmailsCCPlaceholder')}
                                                type="text"
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {t('contactEmailsCCDescription')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
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
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 rounded-[6px] text-muted-foreground hover:text-destructive"
                                aria-label={t('delete')}
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleDelete(body.id)
                                }}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </li>
                    ))}
                </ul>
            </div>
            </Dialog>
        </div>
    )
} 
