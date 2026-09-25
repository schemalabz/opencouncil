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
import { Checkbox } from "../ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { useTranslations } from 'next-intl'
import { Calendar } from "../ui/calendar"
import React from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { format, parse, setHours, setMinutes } from "date-fns"
import InputWithDerivatives from "../InputWithDerivatives"
import { LinkOrDrop } from "../ui/link-or-drop"
import { YouTubePreview } from "./YouTubePreview"
import { CouncilMeeting, MeetingFormat, MeetingKind, MeetingScheduleStatus } from '@prisma/client'
import { SCHEDULE_STATUS_REASON_MAX_LENGTH } from '@/lib/meetingLifecycleRules'
import { meetingDisplayName } from '@/lib/meetingName'
import { DEFAULT_TIMEZONE } from '@/lib/formatters/time'
import { Textarea } from '../ui/textarea'
import { formatDateAsMeetingId } from '@/lib/utils/meetingId'
import { meetingIdForRequest, meetingRequestFields, postponementCandidatesUrl } from './meetingFormRequest'
import { useToast } from "@/hooks/use-toast"
// @ts-ignore
import { toPhoneticLatin as toGreeklish } from 'greek-utils'
/** An optional name override: empty, or at least two characters. */
const nameOverride = (message: string) => z.string().refine(val => val.trim() === '' || val.trim().length >= 2, { message })

const formSchema = z.object({
    name: nameOverride("Meeting name must be at least 2 characters."),
    name_en: nameOverride("Meeting name (English) must be at least 2 characters."),
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
    // Empty on create: the API makes the id from the date and adds _2, _3 when
    // the day already has a meeting. A typed id is sent as it is.
    meetingId: z.string().optional(),
    administrativeBodyId: z.string().optional(),
    processAgenda: z.boolean().default(true),
    // A new meeting needs a kind. Only archive meetings have none, and an edit
    // keeps that until the admin chooses one.
    kind: z.nativeEnum(MeetingKind).nullable(),
    scheduleStatus: z.nativeEnum(MeetingScheduleStatus),
    scheduleStatusReason: z.string().max(SCHEDULE_STATUS_REASON_MAX_LENGTH).optional(),
    sessionNumber: z.string().regex(/^\s*(\d*)\s*$/, { message: "The session number is a whole number." })
        .refine(val => val.trim() === '' || Number(val) >= 1, { message: "The session number is 1 or more." })
        .optional(),
    format: z.nativeEnum(MeetingFormat),
    closedToPublic: z.boolean(),
    place: z.string().max(200).optional(),
    postponedFromId: z.string().optional(),
})

const KINDS = Object.values(MeetingKind)
/** The Select's sentinel for the null kind of an archive meeting. */
const UNKNOWN_KIND = 'unknown'
// Meetings by circulation are not added to the platform yet (#150 follow-up):
// the value exists for completeness, and the form offers it only to keep the
// format of a meeting that already has it.
const OFFERED_FORMATS = Object.values(MeetingFormat).filter(format => format !== MeetingFormat.byCirculation)
const STATUSES = Object.values(MeetingScheduleStatus)
/** Kinds and formats that the law gives to the council only. */
const COUNCIL_ONLY: ReadonlySet<string> = new Set<string>([MeetingKind.accountability, MeetingKind.annualReport, MeetingFormat.byCirculation])

/** A row of the editor list that the "postponed from" picker needs. */
interface PostponementCandidate {
    id: string;
    name: string | null;
    name_en: string | null;
    kind: MeetingKind | null;
    dateTime: string;
    scheduleStatus: MeetingScheduleStatus;
    administrativeBodyId: string | null;
    administrativeBody: { name: string; name_en: string } | null;
    postponedFromId: string | null;
}

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
    const [administrativeBodies, setAdministrativeBodies] = useState<Array<{ id: string, name: string, type: string, place: string | null }>>([])
    const [cityMeetings, setCityMeetings] = useState<PostponementCandidate[]>([])
    const t = useTranslations('AddMeetingForm')

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: meeting?.name || "",
            name_en: meeting?.name_en || "",
            date: meeting ? new Date(meeting.dateTime) : new Date(),
            time: meeting ? format(new Date(meeting.dateTime), "HH:mm") : "12:00",
            youtubeUrl: meeting?.youtubeUrl || "",
            agendaUrl: meeting?.agendaUrl || "",
            meetingId: meeting?.id ?? "",
            administrativeBodyId: meeting?.administrativeBodyId || "none",
            processAgenda: true,
            kind: meeting ? meeting.kind : MeetingKind.regular,
            scheduleStatus: meeting?.scheduleStatus ?? MeetingScheduleStatus.scheduled,
            scheduleStatusReason: meeting?.scheduleStatusReason ?? "",
            sessionNumber: meeting?.sessionNumber?.toString() ?? "",
            format: meeting?.format ?? MeetingFormat.inPerson,
            closedToPublic: meeting?.closedToPublic ?? false,
            place: meeting?.place ?? "",
            postponedFromId: meeting?.postponedFromId ?? "none",
        },
    })

    const selectedBody = administrativeBodies.find(body => body.id === form.watch('administrativeBodyId'))
    // A meeting with no body reads as the council's.
    const isCouncil = !selectedBody || selectedBody.type === 'council'
    const scheduleStatus = form.watch('scheduleStatus')
    // The page payload of a meeting hides its link to the postponed meeting,
    // so an edit reads the current link from the editor list.
    // The first list holds the edited meeting (the window is around its date).
    // Keep the link that it shows, so a later date change in the form, which
    // moves the window, does not lose it.
    const [knownLink, setKnownLink] = useState<string | null>(null)
    const listedLink = cityMeetings.find(m => m.id === meeting?.id)?.postponedFromId ?? null
    if (listedLink && listedLink !== knownLink) setKnownLink(listedLink)
    const currentLink = listedLink ?? knownLink ?? meeting?.postponedFromId ?? null
    // The postponed meetings of the same body that have no new meeting yet,
    // plus the one that this meeting already follows.
    const takenPostponements = new Set(cityMeetings.map(m => m.postponedFromId).filter(id => id && id !== currentLink))
    const postponementCandidates = cityMeetings.filter(m =>
        m.scheduleStatus === 'postponed'
        && m.id !== meeting?.id
        && (m.administrativeBodyId ?? 'none') === (form.watch('administrativeBodyId') ?? 'none')
        && !takenPostponements.has(m.id))

    // The picker of the postponed meeting reads a window around the date that
    // the form holds, so a new meeting on another date finds its candidates.
    const selectedDate = form.watch('date')
    const meetingDay = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null

    useEffect(() => {
        // Fetch administrative bodies for the city
        fetch(`/api/cities/${cityId}/administrative-bodies`)
            .then(res => res.json())
            .then(data => setAdministrativeBodies(data))
            .catch(err => console.error('Failed to fetch administrative bodies:', err));
    }, [cityId])

    useEffect(() => {
        fetch(postponementCandidatesUrl(cityId, meetingDay ? new Date(meetingDay) : new Date()))
            .then(res => res.json())
            .then((data: PostponementCandidate[]) => setCityMeetings(Array.isArray(data) ? data : []))
            .catch(err => console.error('Failed to fetch meetings:', err));
    }, [cityId, meetingDay])

    useEffect(() => {
        if (currentLink && !form.formState.dirtyFields.postponedFromId) {
            form.resetField('postponedFromId', { defaultValue: currentLink })
        }
    }, [currentLink, form])

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
                    meetingId: meetingIdForRequest(values.meetingId, Boolean(meeting)),
                    // "none" is a UI sentinel (Radix Select can't have an empty-string
                    // item) — it must not reach the API, where any truthy value is
                    // stored as a foreign key and "none" violates the FK constraint.
                    // null clears the body; an omitted field would keep it.
                    administrativeBodyId: values.administrativeBodyId === 'none' ? null : values.administrativeBodyId,
                    ...meetingRequestFields(values, { linkChanged: Boolean(form.formState.dirtyFields.postponedFromId) }),
                    // A later part of a meeting has no kind and no number of its
                    // own; the form edits neither (the continuation form is a follow-up).
                    ...(meeting?.continuationOfId ? { kind: undefined, sessionNumber: undefined } : {}),
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
                // A lifecycle rule answers 422 with a message that names the rule.
                throw new Error(errorData.message || (typeof errorData.error === 'string' ? errorData.error : null) || t(meeting ? 'failedToUpdateMeeting' : 'failedToAddMeeting'))
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
                        name="kind"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('kind')}</FormLabel>
                                <Select onValueChange={value => field.onChange(value === UNKNOWN_KIND ? null : value)} value={field.value ?? UNKNOWN_KIND}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {meeting && meeting.kind === null && (
                                            <SelectItem value={UNKNOWN_KIND}>{t('kindUnknown')}</SelectItem>
                                        )}
                                        {KINDS.map(kind => (
                                            <SelectItem key={kind} value={kind} disabled={COUNCIL_ONLY.has(kind) && !isCouncil}>
                                                {t(`kindOptions.${kind}`)}{COUNCIL_ONLY.has(kind) ? ` (${t('councilOnly')})` : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormDescription>{t('kindDescription')}</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="scheduleStatus"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('scheduleStatus')}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {STATUSES.map(status => (
                                            <SelectItem key={status} value={status}>{t(`scheduleStatusOptions.${status}`)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormDescription>{t('scheduleStatusDescription')}</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    {scheduleStatus !== MeetingScheduleStatus.scheduled && (
                        <FormField
                            control={form.control}
                            name="scheduleStatusReason"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('scheduleStatusReason')}</FormLabel>
                                    <FormControl>
                                        <Textarea {...field} placeholder={t('scheduleStatusReasonPlaceholder')} maxLength={SCHEDULE_STATUS_REASON_MAX_LENGTH} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}
                    <FormField
                        control={form.control}
                        name="postponedFromId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('postponedFrom')}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || "none"}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">{t('postponedFromNone')}</SelectItem>
                                        {postponementCandidates.map(candidate => (
                                            <SelectItem key={candidate.id} value={candidate.id}>
                                                {meetingDisplayName(candidate, 'el', DEFAULT_TIMEZONE)}
                                            </SelectItem>
                                        ))}
                                        {/* The current link stays selectable when its meeting is outside the window. */}
                                        {currentLink && !postponementCandidates.some(candidate => candidate.id === currentLink) && (
                                            <SelectItem value={currentLink}>{currentLink}</SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                                <FormDescription>{t('postponedFromDescription')}</FormDescription>
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
                            const meetingId = form.watch('meetingId') || formatDateAsMeetingId(form.watch('date') ?? new Date())
                            
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
                            const meetingId = form.watch('meetingId') || formatDateAsMeetingId(form.watch('date') ?? new Date())
                            
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
                    {!meeting && (
                        <FormField
                            control={form.control}
                            name="processAgenda"
                            render={({ field }) => {
                                const agendaUrl = form.watch('agendaUrl')
                                const hasAgenda = !!agendaUrl && agendaUrl.length > 0
                                return (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value && hasAgenda}
                                                onCheckedChange={field.onChange}
                                                disabled={!hasAgenda}
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel className={!hasAgenda ? "text-muted-foreground" : ""}>
                                                {t('processAgenda')}
                                            </FormLabel>
                                            <FormDescription>
                                                {t('processAgendaDescription')}
                                            </FormDescription>
                                        </div>
                                    </FormItem>
                                )
                            }}
                        />
                    )}
                    <FormField
                        control={form.control}
                        name="sessionNumber"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('sessionNumber')}</FormLabel>
                                <FormControl>
                                    <Input {...field} inputMode="numeric" className="max-w-[8rem]" />
                                </FormControl>
                                <FormDescription>{t('sessionNumberDescription')}</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="format"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('format')}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {(meeting?.format === MeetingFormat.byCirculation ? [...OFFERED_FORMATS, MeetingFormat.byCirculation] : OFFERED_FORMATS).map(format => (
                                            <SelectItem key={format} value={format} disabled={COUNCIL_ONLY.has(format) && !isCouncil}>
                                                {t(`formatOptions.${format}`)}{COUNCIL_ONLY.has(format) ? ` (${t('councilOnly')})` : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
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
                                    <Input {...field} placeholder={selectedBody?.place ?? ''} />
                                </FormControl>
                                <FormDescription>{t('placeDescription')}</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="closedToPublic"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel>{t('closedToPublic')}</FormLabel>
                                    <FormDescription>{t('closedToPublicDescription')}</FormDescription>
                                </div>
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
                        <CollapsibleContent className="space-y-8">
                            <div className="space-y-2">
                                <InputWithDerivatives
                                    baseName="name"
                                    basePlaceholder={t('meetingNamePlaceholder')}
                                    baseDescription={t('nameOverrideDescription')}
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
                            </div>
                            <FormField
                                control={form.control}
                                name="meetingId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('meetingId')}</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                disabled={Boolean(meeting)}
                                                placeholder={formatDateAsMeetingId(form.watch('date') ?? new Date())}
                                            />
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
