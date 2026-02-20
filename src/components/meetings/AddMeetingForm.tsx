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
import React from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { format, parse, setHours, setMinutes } from "date-fns"
import InputWithDerivatives from "../InputWithDerivatives"
import { LinkOrDrop } from "../ui/link-or-drop"
import { YouTubePreview } from "./YouTubePreview"
import { CouncilMeeting } from '@prisma/client'
import { useToast } from "@/hooks/use-toast"
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
    time: z.string({
        required_error: "Meeting time is required.",
    }),
    youtubeUrl: z.string().url({
        message: "Invalid media URL.",
    }).optional().or(z.literal("")),
    agendaUrl: z.string().url({
        message: "Invalid Agenda URL.",
    }).optional().or(z.literal("")),
    meetingId: z.string().min(1, {
        message: "Meeting ID is required.",
    }),
    administrativeBodyId: z.string().optional(),
})

interface AddMeetingFormProps {
    cityId: string;
    meeting?: CouncilMeeting;
    onSuccess?: () => void;
}

export default function AddMeetingForm({ cityId, meeting, onSuccess }: AddMeetingFormProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const [administrativeBodies, setAdministrativeBodies] = useState<Array<{ id: string, name: string, type: string }>>([])
    const t = useTranslations('AddMeetingForm')

    // Helper function to format date as meeting ID
    const formatDateAsMeetingId = (date: Date) => {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            .toLowerCase().replace(/\s/g, '').replace(',', '_');
    }

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: meeting?.name || "",
            name_en: meeting?.name_en || "",
            date: meeting ? new Date(meeting.dateTime) : new Date(),
            time: meeting ? format(new Date(meeting.dateTime), "HH:mm") : "12:00",
            youtubeUrl: meeting?.youtubeUrl || "",
            agendaUrl: meeting?.agendaUrl || "",
            meetingId: meeting?.id || formatDateAsMeetingId(meeting ? new Date(meeting.dateTime) : new Date()),
            administrativeBodyId: meeting?.administrativeBodyId || "none",
        },
    })

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
                form.setValue('meetingId', formatDateAsMeetingId(value.date));
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
            // Parse time and combine with date
            const [hours, minutes] = values.time.split(':').map(Number)
            const dateTime = new Date(values.date)
            dateTime.setHours(hours)
            dateTime.setMinutes(minutes)
            dateTime.setSeconds(0)
            dateTime.setMilliseconds(0)

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...values,
                    date: dateTime.toISOString(),
                }),
            })

            if (response.ok) {
                toast({
                    title: t('success'),
                    description: meeting ? t('meetingUpdated') : t('meetingCreated'),
                })
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
            const errorMessage = error instanceof Error ? error.message : t('unexpectedError')
            toast({
                title: t('error'),
                description: errorMessage,
                variant: "destructive",
            })
            setFormError(errorMessage)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 h-full">
                {formError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-red-800">
                                    {t('error')}
                                </h3>
                                <div className="mt-2 text-sm text-red-700">
                                    {formError}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
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
                            <FormItem className="flex flex-col mb-4">
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
                                    className="mb-2"
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
                        name="time"
                        render={({ field }) => (
                            <FormItem className="mb-6">
                                <FormLabel>{t('meetingTime')}</FormLabel>
                                <FormControl>
                                    <Input
                                        type="time"
                                        {...field}
                                        className="text-xl p-4 h-12 w-full max-w-xs"
                                    />
                                </FormControl>
                                <FormDescription>
                                    {t('meetingTimeDescription')}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="youtubeUrl"
                        render={({ field }) => {
                            const meetingId = form.watch('meetingId')
                            
                            return (
                                <FormItem>
                                    <FormLabel>{t('meetingVideo')}</FormLabel>
                                    <FormControl>
                                        <LinkOrDrop
                                            {...field}
                                            placeholder="https://... (YouTube, Vimeo, etc.)"
                                            onUrlChange={(url) => field.onChange(url)}
                                            config={meetingId ? {
                                                cityId,
                                                identifier: meetingId,
                                                suffix: 'recording'
                                            } : undefined}
                                        />
                                    </FormControl>
                                    <YouTubePreview url={field.value || ""} />
                                    <FormDescription>
                                        {t('meetingVideoDescription')}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )
                        }}
                    />
                    <FormField
                        control={form.control}
                        name="agendaUrl"
                        render={({ field }) => {
                            const meetingId = form.watch('meetingId')
                            
                            return (
                                <FormItem>
                                    <FormLabel>{t('meetingAgenda')}</FormLabel>
                                    <FormControl>
                                        <LinkOrDrop
                                            {...field}
                                            placeholder={t('meetingAgendaPlaceholder') || "https://... or drop a PDF file"}
                                            onUrlChange={(url) => field.onChange(url)}
                                            config={meetingId ? {
                                                cityId,
                                                identifier: meetingId,
                                                suffix: 'agenda'
                                            } : undefined}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        {t('meetingAgendaDescription')}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )
                        }}
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
