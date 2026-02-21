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
import { Loader2, Pencil, Trash2, XCircle, Send, CheckCircle } from "lucide-react"
import { AdministrativeBodyType, NotificationBehavior } from '@prisma/client'
import { TripleToggle } from "@/components/ui/triple-toggle"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
    notificationBehavior: z.enum(['NOTIFICATIONS_DISABLED', 'NOTIFICATIONS_AUTO', 'NOTIFICATIONS_APPROVAL'])
})

interface AdministrativeBody {
    id: string;
    name: string;
    name_en: string;
    type: AdministrativeBodyType;
    youtubeChannelUrl?: string | null;
    contactEmails?: string[];
    notificationBehavior?: NotificationBehavior | null;
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
        notificationBehavior: body?.notificationBehavior || "NOTIFICATIONS_APPROVAL"
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
        <div className="space-y-4">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                    <Button onClick={(e) => {
                        e.preventDefault();
                        setEditingBody(null)
                        form.reset(getFormDefaults())
                        setIsDialogOpen(true)
                    }}>
                        {t('addNew')}
                    </Button>
                </DialogTrigger>
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
            </Dialog>

            <div className="grid gap-4">
                {bodies.map((body) => (
                    <Card key={body.id}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {body.name}
                            </CardTitle>
                            <div className="flex space-x-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setEditingBody(body)
                                        form.reset(getFormDefaults(body))
                                        setIsDialogOpen(true)
                                    }}
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleDelete(body.id)
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">
                                {body.name_en} ({t(`types.${body.type.toLowerCase()}`)})
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
} 
