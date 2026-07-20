"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
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
import { SheetClose } from "@/components/ui/sheet"
import { Offer } from '@prisma/client'
import { Loader2, Check } from "lucide-react"
import { useTranslations } from 'next-intl'
import { useToast } from "@/hooks/use-toast"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Slider } from '@/components/ui/slider'
import { createOffer } from '@/lib/db/offers'
import { updateOffer } from '@/lib/db/offers'
import { getCities } from '@/lib/db/cities'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import {
    calculateOfferTotals,
    CURRENT_OFFER_VERSION,
    getPlatformMonthlyPrice,
    SESSION_PROCESSING,
} from '@/lib/pricing'
import { Switch } from "@/components/ui/switch"
import { adamSchema } from '@/lib/zod-schemas/offer'
import { useSession } from 'next-auth/react'

const formSchema = z.object({
    recipientName: z.string().min(2, {
        message: "Recipient name must be at least 2 characters.",
    }),
    platformPrice: z.number().min(0, {
        message: "Platform price must be a positive number.",
    }),
    ingestionPerHourPrice: z.number().min(0, {
        message: "Ingestion price per hour must be a positive number.",
    }),
    hoursToIngest: z.number().int().min(1, {
        message: "Hours to ingest must be at least 1.",
    }),
    discountPercentage: z.number().min(0).max(100, {
        message: "Discount percentage must be between 0 and 100.",
    }),
    type: z.string().default("pilot"),
    startDate: z.date({
        required_error: "Start date is required.",
    }),
    endDate: z.date({
        required_error: "End date is required.",
    }),
    respondToName: z.string().min(2, {
        message: "Respond to name must be at least 2 characters.",
    }),
    respondToEmail: z.string().email({
        message: "Please enter a valid email address.",
    }),
    respondToPhone: z.string().min(10, {
        message: "Please enter a valid phone number.",
    }),
    cityId: z.string().optional(),
    correctnessGuarantee: z.boolean().default(false),
    meetingsToIngest: z.number().int().min(1).optional(),
    hoursToGuarantee: z.number().int().min(1).optional(),
    includeEquipmentRental: z.boolean().default(false),
    equipmentRentalPrice: z.number().min(0).optional(),
    equipmentRentalName: z.string().optional(),
    equipmentRentalDescription: z.string().optional(),
    includePhysicalPresence: z.boolean().default(false),
    physicalPresenceHours: z.number().int().min(0).optional(),
    agreed: z.boolean().default(false),
    adam: adamSchema,
})

interface OfferFormProps {
    offer?: Offer
    onSuccess?: (data: any) => void
    cityId?: string
    /** Pre-fill values from a previous offer (used for renewals). */
    renewFrom?: Offer
}

/**
 * Default start date: 1st of next month, unless that's less than 5 days
 * away — in which case the 1st of the month after.
 */
function defaultStartDate(now: Date = new Date()): Date {
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const firstOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const daysAway = (firstOfNextMonth.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    if (daysAway < 5) {
        return new Date(today.getFullYear(), today.getMonth() + 2, 1)
    }
    return firstOfNextMonth
}

/**
 * Default end date for a 12-month contract: last day of the month immediately
 * before the same month next year. e.g. start=2026-05-01 → end=2027-04-30.
 */
function defaultEndDate(start: Date): Date {
    return new Date(start.getFullYear() + 1, start.getMonth(), 0)
}

const DEFAULT_HOURS_TO_INGEST = 100

export default function OfferForm({ offer, onSuccess, cityId, renewFrom }: OfferFormProps) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [cities, setCities] = useState<{ id: string, name: string, population: number | null }[]>([])
    const t = useTranslations('OfferForm')
    const { toast } = useToast()
    const { data: session } = useSession()

    const isFreshCreate = !offer && !renewFrom

    useEffect(() => {
        const loadCities = async () => {
            try {
                const citiesData = await getCities({ includeUnlisted: true })
                setCities(citiesData.map(city => ({ id: city.id, name: city.name, population: city.population })))
            } catch (error) {
                console.error('Failed to load cities:', error)
            }
        }
        loadCities()
    }, [])

    // Source for pre-filling: existing offer (edit) or renewFrom (renewal create) or empty (fresh create)
    const source: Partial<Offer> | undefined = offer || renewFrom

    // Renewal default dates: start = max(today, prev.endDate + 1 day),
    // end = day before the first anniversary — a 12-month inclusive term,
    // consistent with fresh-offer defaults (e.g. 2027-02-28 → 2028-02-27).
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const renewStart = renewFrom
        ? (() => {
              const dayAfter = new Date(renewFrom.endDate)
              dayAfter.setDate(dayAfter.getDate() + 1)
              return dayAfter > today ? dayAfter : today
          })()
        : null
    const renewEnd = renewStart
        ? (() => {
              const e = new Date(renewStart)
              e.setFullYear(e.getFullYear() + 1)
              e.setDate(e.getDate() - 1)
              return e
          })()
        : null

    // Defaults for fresh creates only (offer/renewFrom override these)
    const freshStart = defaultStartDate()
    const freshEnd = defaultEndDate(freshStart)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            recipientName: source?.recipientName || "",
            platformPrice: source?.platformPrice || 0,
            ingestionPerHourPrice: source?.ingestionPerHourPrice ?? (isFreshCreate ? SESSION_PROCESSING.pricePerHour : 0),
            hoursToIngest: source?.hoursToIngest || (isFreshCreate ? DEFAULT_HOURS_TO_INGEST : 1),
            discountPercentage: source?.discountPercentage || 0,
            type: source?.type || "pilot",
            startDate: renewStart || offer?.startDate || (isFreshCreate ? freshStart : new Date()),
            endDate: renewEnd || offer?.endDate || (isFreshCreate ? freshEnd : new Date()),
            respondToName: source?.respondToName || (isFreshCreate ? session?.user?.name || "" : ""),
            respondToEmail: source?.respondToEmail || (isFreshCreate ? session?.user?.email || "" : ""),
            respondToPhone: source?.respondToPhone || (isFreshCreate ? session?.user?.phone || "" : ""),
            cityId: cityId || source?.cityId || undefined,
            correctnessGuarantee: source?.correctnessGuarantee ?? isFreshCreate,
            meetingsToIngest: source?.meetingsToIngest || 1,
            hoursToGuarantee: source?.hoursToGuarantee || (isFreshCreate ? DEFAULT_HOURS_TO_INGEST : 1),
            includeEquipmentRental: !!(source?.equipmentRentalPrice && source.equipmentRentalPrice > 0),
            equipmentRentalPrice: source?.equipmentRentalPrice || 0,
            equipmentRentalName: source?.equipmentRentalName || "",
            equipmentRentalDescription: source?.equipmentRentalDescription || "",
            includePhysicalPresence: !!(source?.physicalPresenceHours && source.physicalPresenceHours > 0),
            physicalPresenceHours: source?.physicalPresenceHours || 0,
            agreed: offer?.agreed || false,
            adam: offer?.adam || "",
        },
    })

    // Auto-prefill platform price from population when a city is picked on a fresh create.
    const watchedCityId = form.watch('cityId')
    useEffect(() => {
        if (!isFreshCreate || !watchedCityId) return
        const population = cities.find(c => c.id === watchedCityId)?.population
        if (population != null) {
            form.setValue('platformPrice', getPlatformMonthlyPrice(population))
        }
    }, [watchedCityId, isFreshCreate, cities, form])

    // Once the session loads, fill responder fields if still empty (fresh create only).
    useEffect(() => {
        if (!isFreshCreate || !session?.user) return
        if (!form.getValues('respondToName') && session.user.name) {
            form.setValue('respondToName', session.user.name)
        }
        if (!form.getValues('respondToEmail') && session.user.email) {
            form.setValue('respondToEmail', session.user.email)
        }
        if (!form.getValues('respondToPhone') && session.user.phone) {
            form.setValue('respondToPhone', session.user.phone)
        }
    }, [session, isFreshCreate, form])


    const watchedValues = form.watch()
    const { total } = calculateOfferTotals({
        ...watchedValues,
        version: CURRENT_OFFER_VERSION,
        id: 'temp',
        createdAt: new Date(),
        updatedAt: new Date()
    } as unknown as Offer)

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true)
        try {
            const commonData = {
                recipientName: values.recipientName,
                platformPrice: values.platformPrice,
                ingestionPerHourPrice: values.ingestionPerHourPrice,
                hoursToIngest: values.hoursToIngest,
                discountPercentage: values.discountPercentage,
                type: values.type,
                startDate: values.startDate,
                endDate: values.endDate,
                respondToName: values.respondToName,
                respondToEmail: values.respondToEmail,
                respondToPhone: values.respondToPhone,
                cityId: values.cityId || null,
                correctnessGuarantee: values.correctnessGuarantee,
                equipmentRentalPrice: values.includeEquipmentRental ? values.equipmentRentalPrice || null : null,
                equipmentRentalName: values.includeEquipmentRental ? values.equipmentRentalName || null : null,
                equipmentRentalDescription: values.includeEquipmentRental ? values.equipmentRentalDescription || null : null,
                physicalPresenceHours: values.includePhysicalPresence ? values.physicalPresenceHours || null : null,
                version: CURRENT_OFFER_VERSION
            };

            if (offer) {
                await updateOffer(offer.id, {
                    ...commonData,
                    meetingsToIngest: values.correctnessGuarantee && offer.version === 1 ? values.meetingsToIngest : null,
                    hoursToGuarantee: values.correctnessGuarantee && offer.version !== null && offer.version > 1 ? values.hoursToGuarantee : null,
                    agreed: values.agreed,
                    adam: values.adam || null,
                });
            } else {
                await createOffer({
                    ...commonData,
                    meetingsToIngest: null,
                    hoursToGuarantee: values.correctnessGuarantee ? values.hoursToGuarantee! : null,
                    agreed: false,
                    adam: null,
                });
            }

            setIsSuccess(true)
            setTimeout(() => setIsSuccess(false), 1000)
            if (onSuccess) {
                onSuccess(values)
            }
            router.refresh()
            form.reset({
                recipientName: "",
                platformPrice: 0,
                ingestionPerHourPrice: 0,
                hoursToIngest: 1,
                discountPercentage: 0,
                type: "pilot",
                startDate: new Date(),
                endDate: new Date(),
                respondToName: "",
                respondToEmail: "",
                respondToPhone: "",
                cityId: undefined,
                correctnessGuarantee: false,
                meetingsToIngest: 1,
                hoursToGuarantee: 1,
                includeEquipmentRental: false,
                equipmentRentalPrice: 0,
                equipmentRentalName: "",
                equipmentRentalDescription: "",
                includePhysicalPresence: false,
                physicalPresenceHours: 0,
                agreed: false,
                adam: "",
            })
            toast({
                title: t('success'),
                description: offer ? t('offerUpdated') : t('offerCreated'),
            })
        } catch (error) {
            console.error(t('failedToSaveOffer'), error)
            toast({
                title: t('error'),
                description: error instanceof Error ? error.message : t('unexpectedError'),
                variant: "destructive",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg mb-4">
                    <h3 className="font-semibold text-lg mb-2">{t('totalPrice')}</h3>
                    <p className="text-2xl font-bold">{formatCurrency(total)}</p>
                </div>


                {Object.keys(form.formState.errors).length > 0 && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                        <strong className="font-bold">{t('formErrors')}</strong>
                        <ul className="mt-2 list-disc list-inside">
                            {Object.entries(form.formState.errors).map(([key, error]) => (
                                <li key={key}>{error.message}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <FormField
                    control={form.control}
                    name="cityId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('city')}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('selectCity')} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {cities.map((city) => (
                                        <SelectItem key={city.id} value={city.id}>
                                            {city.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormDescription>
                                {t('cityDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="recipientName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('recipientName')}</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormDescription>
                                {t('recipientNameDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="platformPrice"
                    render={({ field }) => {
                        const selectedPopulation = cities.find(c => c.id === watchedCityId)?.population;
                        return (
                            <FormItem>
                                <FormLabel>{t('platformPrice')}</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        {...field}
                                        onChange={e => field.onChange(parseFloat(e.target.value))}
                                    />
                                </FormControl>
                                <FormDescription>
                                    {t('platformPriceDescription')}
                                    {watchedCityId && (
                                        selectedPopulation != null
                                            ? <> · Πληθυσμός: {selectedPopulation.toLocaleString('el-GR')}</>
                                            : <> · Πληθυσμός: <span className="text-amber-700">άγνωστος</span></>
                                    )}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        );
                    }}
                />

                <FormField
                    control={form.control}
                    name="ingestionPerHourPrice"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('ingestionPerHourPrice')}</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    {...field}
                                    onChange={e => field.onChange(parseFloat(e.target.value))}
                                />
                            </FormControl>
                            <FormDescription>
                                {t('ingestionPerHourPriceDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="hoursToIngest"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('hoursToIngest')}</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    {...field}
                                    onChange={e => field.onChange(parseInt(e.target.value))}
                                />
                            </FormControl>
                            <FormDescription>
                                {t('hoursToIngestDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="discountPercentage"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('discountPercentage')}</FormLabel>
                            <FormControl>
                                <div className="flex items-center gap-2">
                                    <Slider
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={[field.value]}
                                        onValueChange={([value]) => field.onChange(value)}
                                    />
                                    <span className="w-12 text-sm">{field.value}%</span>
                                </div>
                            </FormControl>
                            <FormDescription>
                                {t('discountPercentageDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="correctnessGuarantee"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <FormLabel className="text-base">
                                    {t('correctnessGuarantee')}
                                </FormLabel>
                                <FormDescription>
                                    {t('correctnessGuaranteeDescription')}
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

                {offer?.version === 1 ? (
                    <FormField
                        control={form.control}
                        name="meetingsToIngest"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('meetingsToIngest')}</FormLabel>
                                <FormControl>
                                    <div className="flex items-center gap-2">
                                        <Slider
                                            disabled={!form.watch('correctnessGuarantee')}
                                            min={1}
                                            max={100}
                                            step={1}
                                            value={[field.value || 1]}
                                            onValueChange={([value]) => field.onChange(value)}
                                        />
                                        <span className="w-12 text-sm">{field.value || 1}</span>
                                    </div>
                                </FormControl>
                                <FormDescription>
                                    {!form.watch('correctnessGuarantee')
                                        ? t('meetingsToIngestDisabledDescription')
                                        : t('meetingsToIngestDescription')
                                    }
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ) : (
                    <FormField
                        control={form.control}
                        name="hoursToGuarantee"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('hoursToGuarantee')}</FormLabel>
                                <FormControl>
                                    <div className="flex items-center gap-2">
                                        <Slider
                                            disabled={!form.watch('correctnessGuarantee')}
                                            min={1}
                                            max={form.watch('hoursToIngest')}
                                            step={1}
                                            value={[field.value || 1]}
                                            onValueChange={([value]) => field.onChange(value)}
                                        />
                                        <span className="w-12 text-sm">{field.value || 1}</span>
                                    </div>
                                </FormControl>
                                <FormDescription>
                                    {!form.watch('correctnessGuarantee')
                                        ? t('hoursToGuaranteeDisabledDescription')
                                        : t('hoursToGuaranteeDescription')
                                    }
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                {/* Equipment Rental Section */}
                <div className="space-y-4 border-t pt-4">
                    <FormField
                        control={form.control}
                        name="includeEquipmentRental"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel className="text-base">
                                        Equipment Rental
                                    </FormLabel>
                                    <FormDescription>
                                        Include cameras, microphones and conferencing equipment (optional)
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

                    {form.watch('includeEquipmentRental') && (
                        <div className="space-y-4 ml-4">
                            <FormField
                                control={form.control}
                                name="equipmentRentalPrice"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Monthly Equipment Price (€)</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                {...field}
                                                onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Monthly price for cameras, microphones and conferencing equipment
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="equipmentRentalName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Equipment Name/Title</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="e.g., Professional Video & Audio Package" />
                                        </FormControl>
                                        <FormDescription>
                                            Short name or title for the equipment package
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="equipmentRentalDescription"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Equipment Description</FormLabel>
                                        <FormControl>
                                            <textarea
                                                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                {...field}
                                                placeholder="Detailed description of equipment included..."
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Detailed description of what equipment is included
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    )}
                </div>

                {/* Physical Presence Section */}
                <div className="space-y-4 border-t pt-4">
                    <FormField
                        control={form.control}
                        name="includePhysicalPresence"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel className="text-base">
                                        Physical Presence
                                    </FormLabel>
                                    <FormDescription>
                                        Include personnel to be physically present at meetings (optional)
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

                    {form.watch('includePhysicalPresence') && (
                        <div className="space-y-4 ml-4">

                            <FormField
                                control={form.control}
                                name="physicalPresenceHours"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Physical Presence Hours</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                {...field}
                                                onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Number of hours for personnel to be physically present at meetings (€25/hour)
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    )}
                </div>

                <FormField
                    control={form.control}
                    name="startDate"
                    render={() => (
                        <FormItem className="flex flex-col">
                            <FormLabel>{t('startDate')} – {t('endDate')}</FormLabel>
                            <FormControl>
                                <DateRangePicker
                                    value={{ from: form.watch('startDate'), to: form.watch('endDate') }}
                                    onChange={(range) => {
                                        if (range?.from) {
                                            form.setValue('startDate', range.from);
                                            form.setValue('endDate', range.to ?? range.from);
                                        }
                                    }}
                                    placeholder={t('startDateDescription')}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="respondToName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('respondToName')}</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormDescription>
                                {t('respondToNameDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="respondToEmail"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('respondToEmail')}</FormLabel>
                            <FormControl>
                                <Input type="email" {...field} />
                            </FormControl>
                            <FormDescription>
                                {t('respondToEmailDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="respondToPhone"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('respondToPhone')}</FormLabel>
                            <FormControl>
                                <Input type="tel" {...field} />
                            </FormControl>
                            <FormDescription>
                                {t('respondToPhoneDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Lifecycle fields — edit mode only. Hidden on create and renewal. */}
                {offer && (
                    <div className="space-y-4 border-t pt-4">
                        <FormField
                            control={form.control}
                            name="agreed"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">
                                            {t('agreed')}
                                        </FormLabel>
                                        <FormDescription>
                                            {t('agreedDescription')}
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
                            name="adam"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('adam')}</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            value={field.value || ""}
                                            placeholder="24PROC015123456"
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        {t('adamDescription')}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                )}

                <div className="flex justify-between">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t('submitting')}
                            </>
                        ) : isSuccess ? (
                            <>
                                <Check className="mr-2 h-4 w-4" />
                                {t('success')}
                            </>
                        ) : (
                            <>{offer ? t('updateOffer') : t('createOffer')}</>
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