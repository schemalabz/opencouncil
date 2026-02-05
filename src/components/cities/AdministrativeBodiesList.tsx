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
    notificationBehavior: z.enum(['NOTIFICATIONS_DISABLED', 'NOTIFICATIONS_AUTO', 'NOTIFICATIONS_APPROVAL']),
    diavgeiaUnitId: z.string().optional().transform(val => val === '' ? undefined : val),
})

interface AdministrativeBody {
    id: string;
    name: string;
    name_en: string;
    type: AdministrativeBodyType;
    youtubeChannelUrl?: string | null;
    notificationBehavior?: NotificationBehavior | null;
    diavgeiaUnitId?: string | null;
}

interface AdministrativeBodiesListProps {
    cityId: string;
    bodies: AdministrativeBody[];
    onUpdate: () => void;
}

export default function AdministrativeBodiesList({ cityId, bodies, onUpdate }: AdministrativeBodiesListProps) {
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [editingBody, setEditingBody] = useState<AdministrativeBody | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const t = useTranslations('AdministrativeBodiesList')

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: editingBody?.name || "",
            name_en: editingBody?.name_en || "",
            type: editingBody?.type || "council",
            youtubeChannelUrl: editingBody?.youtubeChannelUrl || "",
            notificationBehavior: editingBody?.notificationBehavior || "NOTIFICATIONS_APPROVAL",
            diavgeiaUnitId: editingBody?.diavgeiaUnitId || "",
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
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
                body: JSON.stringify(values),
            })

            if (response.ok) {
                onUpdate()
                setEditingBody(null)
                form.reset({
                    name: "",
                    name_en: "",
                    type: "council",
                    youtubeChannelUrl: "",
                    notificationBehavior: "NOTIFICATIONS_APPROVAL",
                    diavgeiaUnitId: "",
                })
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
                        form.reset({
                            name: "",
                            name_en: "",
                            type: "council",
                            youtubeChannelUrl: "",
                            notificationBehavior: "NOTIFICATIONS_APPROVAL",
                            diavgeiaUnitId: "",
                        })
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
                                name="diavgeiaUnitId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('diavgeiaUnitId')}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                placeholder={t('diavgeiaUnitIdPlaceholder')}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {t('diavgeiaUnitIdDescription')}
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
                                        form.reset({
                                            name: body.name,
                                            name_en: body.name_en,
                                            type: body.type,
                                            youtubeChannelUrl: body.youtubeChannelUrl || "",
                                            notificationBehavior: body.notificationBehavior || "NOTIFICATIONS_APPROVAL",
                                            diavgeiaUnitId: body.diavgeiaUnitId || "",
                                        })
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
