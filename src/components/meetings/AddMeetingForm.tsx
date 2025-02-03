"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "../ui/button"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "../ui/form"
import { Input } from "../ui/input"
import { SheetClose } from "../ui/sheet"
import { Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { useTranslations } from 'next-intl'
import { Calendar } from "../ui/calendar"
import { fetchVideos, Video } from "@/lib/fetchVideos"
import React from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import InputWithDerivatives from "../InputWithDerivatives"
import { LinkOrDrop } from "../ui/link-or-drop"
import { CouncilMeeting } from '@prisma/client'
// @ts-ignore
import { toPhoneticLatin as toGreeklish } from 'greek-utils'

const formSchema = z.object({
    name: z.string().min(2, {
        message: "Meeting name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "Meeting name (English) must be at least 2 characters.",
    }),
    date: z.date({
        required_error: "Meeting date is required.",
    }),
    youtubeUrl: z.string().url({
        message: "Invalid YouTube URL.",
    }).optional().or(z.literal("")),
    agendaUrl: z.string().url({
        message: "Invalid Agenda URL.",
    }).optional().or(z.literal("")),
    meetingId: z.string().min(1, {
        message: "Meeting ID is required.",
    }),
    administrativeBodyId: z.union([z.literal("none"), z.string()]).transform(value => value === "none" ? null : value),
})

interface AddMeetingFormProps {
    cityId: string;
    meeting?: CouncilMeeting;
    onSuccess?: () => void;
}

export default function AddMeetingForm({ cityId, meeting, onSuccess }: AddMeetingFormProps) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [videos, setVideos] = useState<Video[]>([])
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const [administrativeBodies, setAdministrativeBodies] = useState<Array<{ id: string, name: string, type: string }>>([])
    const t = useTranslations('AddMeetingForm')

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: meeting?.name || "",
            name_en: meeting?.name_en || "",
            date: meeting ? new Date(meeting.dateTime) : new Date(),
            youtubeUrl: meeting?.youtubeUrl || "",
            agendaUrl: meeting?.agendaUrl || "",
            meetingId: meeting?.id || "",
            administrativeBodyId: meeting?.administrativeBodyId || "none",
        },
    })

    useEffect(() => {
        console.log("fetching videos");
        fetchVideos().then(setVideos);
    }, [])

    useEffect(() => {
        // Fetch administrative bodies for the city
        fetch(`/api/cities/${cityId}/administrative-bodies`)
            .then(res => res.json())
            .then(data => setAdministrativeBodies(data))
            .catch(err => console.error('Failed to fetch administrative bodies:', err));
    }, [cityId])

    useEffect(() => {
        const subscription = form.watch((value, { name }) => {
            if (name === 'date' && value.date) {
                const formattedDate = value.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    .toLowerCase().replace(/\s/g, '').replace(',', '_');
                form.setValue('meetingId', formattedDate);
            }
        });
        return () => subscription.unsubscribe();
    }, [form])

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true)
        setFormError(null)

        const url = meeting
            ? `/api/cities/${cityId}/meetings/${meeting.id}`
            : `/api/cities/${cityId}/meetings`
        const method = meeting ? 'PUT' : 'POST'

        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...values,
                    date: values.date.toISOString(),
                }),
            })

            if (response.ok) {
                if (onSuccess) {
                    onSuccess()
                }
                router.refresh()
            } else {
                const errorData = await response.json()
                throw new Error(errorData.message || t(meeting ? 'failedToUpdateMeeting' : 'failedToAddMeeting'))
            }
        } catch (error) {
            console.error(meeting ? t('failedToUpdateMeeting') : t('failedToAddMeeting'), error)
            setFormError(error instanceof Error ? error.message : t('unexpectedError'))
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 h-full">
                <div className="space-y-8">
                    <InputWithDerivatives
                        baseName="name"
                        basePlaceholder={t('meetingNamePlaceholder')}
                        baseDescription={t('meetingNameDescription')}
                        derivatives={[
                            {
                                name: 'name_en',
                                calculate: (baseValue) => toGreeklish(baseValue),
                                placeholder: t('meetingNameEnPlaceholder'),
                                description: t('meetingNameEnDescription'),
                            },
                        ]}
                        form={form}
                    />
                    <FormField
                        control={form.control}
                        name="administrativeBodyId"
                        render={({ field: { value, onChange, ...field } }) => (
                            <FormItem>
                                <FormLabel>{t('administrativeBody')}</FormLabel>
                                <Select onValueChange={onChange} value={value?.toString() || "none"}>
                                    <FormControl>
                                        <SelectTrigger {...field}>
                                            <SelectValue placeholder={t('selectAdministrativeBody')} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">
                                            {t('noAdministrativeBody')}
                                        </SelectItem>
                                        {administrativeBodies.map((body) => (
                                            <SelectItem key={body.id} value={body.id}>
                                                {body.name} ({t(`administrativeBodyType.${body.type.toLowerCase()}`)})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormDescription>
                                    {t('administrativeBodyDescription')}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>{t('meetingDate')}</FormLabel>
                                <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={(date) => {
                                        if (date && date.getTime() !== field.value.getTime()) {
                                            field.onChange(date);
                                        }
                                    }}
                                    disabled={(date) =>
                                        date < new Date("2000-01-01")
                                    }
                                    initialFocus
                                />
                                <FormDescription>
                                    {t('meetingDateDescription')}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="youtubeUrl"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('meetingVideo')}</FormLabel>
                                <FormControl>
                                    <Input {...field} placeholder="https://www.youtube.com/watch?v=..." />
                                </FormControl>
                                <FormDescription>
                                    {t('meetingVideoDescription')}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="agendaUrl"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('meetingAgenda')}</FormLabel>
                                <FormControl>
                                    <LinkOrDrop
                                        {...field}
                                        placeholder={t('meetingAgendaPlaceholder') || "https://... or drop a PDF file"}
                                        onUrlChange={(url) => field.onChange(url)}
                                    />
                                </FormControl>
                                <FormDescription>
                                    {t('meetingAgendaDescription')}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" className="flex w-full justify-between p-0">
                                {t('details')}
                                {isDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <FormField
                                control={form.control}
                                name="meetingId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('meetingId')}</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormDescription>
                                            {t('meetingIdDescription')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CollapsibleContent>
                    </Collapsible>
                </div>
                {formError && <p className="text-red-500">{formError}</p>}
                <div className="flex justify-between sticky bottom-0 py-4 bg-background border-t">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t('submitting')}
                            </>
                        ) : (
                            meeting ? t('updateMeeting') : t('addMeeting')
                        )}
                    </Button>
                    <SheetClose asChild>
                        <Button type="button" variant="outline">{t('cancel')}</Button>
                    </SheetClose>
                </div>
            </form>
        </Form>
    )
}
