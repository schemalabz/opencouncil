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
import { Calendar } from "@/components/ui/calendar"
import { Slider } from '@/components/ui/slider'
import { createOffer } from '@/lib/db/offers'
import { updateOffer } from '@/lib/db/offers'
import { getCities } from '@/lib/db/cities'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect } from 'react'
import { calculateOfferTotals, formatCurrency } from '@/lib/utils'
import { Switch } from "@/components/ui/switch"

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
    hoursToGuarantee: z.number().int().min(1).optional()
})

interface OfferFormProps {
    offer?: Offer
    onSuccess?: (data: any) => void
    cityId?: string
}

export default function OfferForm({ offer, onSuccess, cityId }: OfferFormProps) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [cities, setCities] = useState<{ id: string, name: string }[]>([])
    const t = useTranslations('OfferForm')
    const { toast } = useToast()

    useEffect(() => {
        const loadCities = async () => {
            try {
                const citiesData = await getCities({ includeUnlisted: true })
                setCities(citiesData.map(city => ({ id: city.id, name: city.name })))
            } catch (error) {
                console.error('Failed to load cities:', error)
            }
        }
        loadCities()
    }, [])

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            recipientName: offer?.recipientName || "",
            platformPrice: offer?.platformPrice || 0,
            ingestionPerHourPrice: offer?.ingestionPerHourPrice || 0,
            hoursToIngest: offer?.hoursToIngest || 1,
            discountPercentage: offer?.discountPercentage || 0,
            type: offer?.type || "pilot",
            startDate: offer?.startDate || new Date(),
            endDate: offer?.endDate || new Date(),
            respondToName: offer?.respondToName || "",
            respondToEmail: offer?.respondToEmail || "",
            respondToPhone: offer?.respondToPhone || "",
            cityId: cityId || offer?.cityId || undefined,
            correctnessGuarantee: offer?.correctnessGuarantee || false,
            meetingsToIngest: offer?.meetingsToIngest || 1,
            hoursToGuarantee: offer?.hoursToGuarantee || 1
        },
    })

    const watchedValues = form.watch()
    const { total } = calculateOfferTotals({ ...watchedValues, version: 3 } as Offer)

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true)

        try {
            if (offer) {
                await updateOffer(offer.id, {
                    ...values,
                    cityId: values.cityId || null,
                    meetingsToIngest: values.correctnessGuarantee && offer.version === 1 ? values.meetingsToIngest : null,
                    hoursToGuarantee: values.correctnessGuarantee && offer.version !== null && offer.version > 1 ? values.hoursToGuarantee : null,
                    correctnessGuarantee: values.correctnessGuarantee,
                    version: 3
                })
            } else {
                await createOffer({
                    ...values,
                    cityId: values.cityId || null,
                    meetingsToIngest: null,
                    hoursToGuarantee: values.correctnessGuarantee ? values.hoursToGuarantee! : null,
                    correctnessGuarantee: values.correctnessGuarantee,
                    version: 3
                })
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
                hoursToGuarantee: 1
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
                    render={({ field }) => (
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
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
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

                <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>{t('startDate')}</FormLabel>
                            <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                    date < new Date()
                                }
                                initialFocus
                            />
                            <FormDescription>
                                {t('startDateDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>{t('endDate')}</FormLabel>
                            <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                    date < form.getValues('startDate')
                                }
                                initialFocus
                            />
                            <FormDescription>
                                {t('endDateDescription')}
                            </FormDescription>
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