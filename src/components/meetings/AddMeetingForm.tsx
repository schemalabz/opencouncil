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

const formSchema = z.object({
    name: z.string().min(2, {
        message: "Meeting name must be at least 2 characters.",
    }),
    date: z.date({
        required_error: "Meeting date is required.",
    }),
    videoId: z.string().min(1, {
        message: "Video selection is required.",
    }),
    meetingId: z.string().min(1, {
        message: "Meeting ID is required.",
    }),
})

interface AddMeetingFormProps {
    cityId: string;
    onSuccess?: () => void;
}

export default function AddMeetingForm({ cityId, onSuccess }: AddMeetingFormProps) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [videos, setVideos] = useState<Video[]>([])
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const t = useTranslations('AddMeetingForm')

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            date: new Date(),
            videoId: "",
            meetingId: "",
        },
    })

    useEffect(() => {
        console.log("fetching videos");
        fetchVideos().then(setVideos);
    }, [])

    useEffect(() => {
        const date = form.getValues('date');
        const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            .toLowerCase().replace(/\s/g, '').replace(',', '_');
        form.setValue('meetingId', formattedDate);
    }, [form.watch('date')])

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true)
        setFormError(null)

        try {
            const response = await fetch(`/api/cities/${cityId}/meetings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(values),
            })

            if (response.ok) {
                if (onSuccess) {
                    onSuccess()
                }
                router.refresh()
            } else {
                const errorData = await response.json()
                throw new Error(errorData.message || t('failedToAddMeeting'))
            }
        } catch (error) {
            console.error(t('failedToAddMeeting'), error)
            setFormError(error instanceof Error ? error.message : t('unexpectedError'))
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('meetingName')}</FormLabel>
                            <FormControl>
                                <Input placeholder={t('meetingNamePlaceholder')} {...field} />
                            </FormControl>
                            <FormDescription>
                                {t('meetingNameDescription')}
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
                                onSelect={field.onChange}
                                disabled={(date) =>
                                    date > new Date() || date < new Date("1900-01-01")
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
                    name="videoId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('meetingVideo')}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('selectVideo')} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {videos.length === 0 && <SelectItem value="none" disabled>{t('noVideosFound')}</SelectItem>}
                                    {videos.map((video) => (
                                        <SelectItem key={video.id} value={video.id}>
                                            {video.name} ({new Date(video.dateAdded).toLocaleDateString()})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormDescription>
                                {t('meetingVideoDescription')}
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
                {formError && <p className="text-red-500">{formError}</p>}
                <div className="flex justify-between">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t('submitting')}
                            </>
                        ) : (
                            t('addMeeting')
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
