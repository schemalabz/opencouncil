"use client"
import { useState, useEffect } from 'react'
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
import { City, AdministrativeBodyType, CityMessage, NotificationBehavior } from '@prisma/client'
import { Loader2, ChevronDown, ChevronUp } from "lucide-react"
import Image from 'next/image'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Switch } from "@/components/ui/switch"
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import InputWithDerivatives from '@/components/InputWithDerivatives'
// @ts-ignore
import { toPhoneticLatin as toGreeklish } from 'greek-utils'
import AdministrativeBodiesList from './AdministrativeBodiesList'
import CityMessageForm, { MessageFormState } from './CityMessageForm'

const formSchema = z.object({
    name: z.string().min(2, {
        message: "City name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "City name (English) must be at least 2 characters.",
    }),
    name_municipality: z.string().min(2, {
        message: "Municipality name must be at least 2 characters.",
    }),
    name_municipality_en: z.string().min(2, {
        message: "Municipality name (English) must be at least 2 characters.",
    }),
    timezone: z.string().min(1, {
        message: "Timezone is required.",
    }),
    logoImage: z.instanceof(File).optional(),
    id: z.string().min(2, {
        message: "ID must be at least 2 characters.",
    }).regex(/^[a-z-]+$/, {
        message: "ID must contain only lowercase letters a-z and dashes.",
    }),
    authorityType: z.enum(['municipality', 'region']),
    supportsNotifications: z.boolean()
})

interface CityFormProps {
    city?: City
    cityMessage?: CityMessage | null
    onSuccess?: () => void
}

export default function CityForm({ city, cityMessage, onSuccess }: CityFormProps) {
    const router = useRouter()
    const { data: session } = useSession()
    const [logoImage, setLogoImage] = useState<File | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [logoPreview, setLogoPreview] = useState<string | null>(city?.logoImage || null)
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const [timezones, setTimezones] = useState<string[]>([])
    const t = useTranslations('CityForm')
    const [administrativeBodies, setAdministrativeBodies] = useState<Array<{
        id: string;
        name: string;
        name_en: string;
        type: AdministrativeBodyType;
        youtubeChannelUrl?: string | null;
        notificationBehavior?: NotificationBehavior | null;
    }>>([])
    const [isAdminBodiesOpen, setIsAdminBodiesOpen] = useState(false)

    // Message data for form submission - only stored when message component updates
    const [messageData, setMessageData] = useState<MessageFormState | null>(null);

    const isSuperAdmin = session?.user?.isSuperAdmin

    useEffect(() => {
        // Get all available timezones
        const allTimezones = Intl.supportedValuesOf('timeZone')
        setTimezones(allTimezones)
    }, [])

    useEffect(() => {
        if (city) {
            fetch(`/api/cities/${city.id}/administrative-bodies`)
                .then(res => res.json())
                .then(data => setAdministrativeBodies(data))
                .catch(err => console.error('Failed to fetch administrative bodies:', err));
        }
    }, [city])

    const idifyName = (name: string) => {
        return name
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')  // Convert spaces to dashes
            .replace(/[^a-z-]/g, '')  // Remove anything that's not lowercase letter or dash
            .replace(/-+/g, '-')  // Replace multiple consecutive dashes with single dash
            .replace(/^-|-$/g, '')  // Remove leading/trailing dashes
    }

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: city?.name || "",
            name_en: city?.name_en || "",
            name_municipality: city?.name_municipality || "",
            name_municipality_en: city?.name_municipality_en || "",
            timezone: city?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            id: city?.id || "",
            authorityType: city?.authorityType || "municipality",
            supportsNotifications: city?.supportsNotifications || false
        },
    })

    useEffect(() => {
        const subscription = form.watch((value, { name }) => {
            // Only auto-derive ID for new cities (not when editing existing cities)
            if (name === 'name' && !city?.id) {
                form.setValue('id', idifyName(value.name || ''))
            }
        })
        return () => subscription.unsubscribe()
    }, [form, city?.id])

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true)
        setFormError(null)
        const url = city ? `/api/cities/${city.id}` : '/api/cities'
        const method = city ? 'PUT' : 'POST'
        const formData = new FormData()
        formData.append('name', values.name)
        formData.append('name_en', values.name_en)
        formData.append('name_municipality', values.name_municipality)
        formData.append('name_municipality_en', values.name_municipality_en)
        formData.append('timezone', values.timezone)
        formData.append('id', values.id)
        formData.append('authorityType', values.authorityType)
        formData.append('supportsNotifications', values.supportsNotifications.toString())
        if (logoImage) {
            formData.append('logoImage', logoImage)
        }

        // Add message data if superadmin and message data exists
        if (isSuperAdmin && messageData) {
            formData.append('hasMessage', messageData.hasMessage.toString())
            if (messageData.hasMessage) {
                const selectedEmoji = messageData.emoji === 'custom' ? messageData.customEmoji : messageData.emoji
                formData.append('messageEmoji', selectedEmoji)
                formData.append('messageTitle', messageData.title)
                formData.append('messageDescription', messageData.description)
                formData.append('messageCallToActionText', messageData.callToActionText || '')
                formData.append('messageCallToActionUrl', messageData.callToActionUrl || '')
                formData.append('messageCallToActionExternal', messageData.callToActionExternal.toString())
                formData.append('messageIsActive', messageData.isActive.toString())
            }
        }

        try {
            const response = await fetch(url, {
                method,
                body: formData,
            })

            if (response.ok) {
                if (onSuccess) {
                    onSuccess()
                }
                router.refresh() // Refresh the page to show updated data
            } else {
                const errorData = await response.json()
                throw new Error(errorData.message || t('failedToSaveCity'))
            }
        } catch (error) {
            console.error(t('failedToSaveCity'), error)
            setFormError(error instanceof Error ? error.message : t('unexpectedError'))
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null
        setLogoImage(file)
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setLogoPreview(reader.result as string)
            }
            reader.readAsDataURL(file)
        } else {
            setLogoPreview(city?.logoImage || null)
        }
    }

    const refreshAdminBodies = () => {
        if (city) {
            fetch(`/api/cities/${city.id}/administrative-bodies`)
                .then(res => res.json())
                .then(data => setAdministrativeBodies(data))
                .catch(err => console.error('Failed to fetch administrative bodies:', err));
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                {formError && (
                    <div className="text-red-500 mb-4">{formError}</div>
                )}
                <InputWithDerivatives
                    baseName="name"
                    basePlaceholder={t('cityNamePlaceholder')}
                    baseDescription={t('cityNameDescription')}
                    derivatives={[
                        { name: "name_en", calculate: (baseValue) => toGreeklish(baseValue), placeholder: t('cityNameEnPlaceholder'), description: t('cityNameEnDescription') },
                        { name: "name_municipality", calculate: (baseValue) => `Δήμος ${baseValue}`, placeholder: t('cityMunicipalityPlaceholder'), description: t('cityMunicipalityDescription') },
                        { name: "name_municipality_en", calculate: (baseValue) => toGreeklish(`Municipality of ${toGreeklish(baseValue)}`), placeholder: t('cityMunicipalityEnPlaceholder'), description: t('cityMunicipalityEnDescription') },
                    ]}
                    form={form}
                />
                <FormField
                    control={form.control}
                    name="authorityType"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('authorityType')}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('selectAuthorityType')} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="municipality">Municipality</SelectItem>
                                    <SelectItem value="region">Region</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormDescription>
                                {t('authorityTypeDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="logoImage"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('logoImage')}</FormLabel>
                            <FormControl>
                                <Input
                                    type="file"
                                    onChange={(e) => {
                                        handleLogoChange(e)
                                        field.onChange(e.target.files?.[0] || null)
                                    }}
                                />
                            </FormControl>
                            <FormDescription>
                                {t('logoImageDescription')}
                            </FormDescription>
                            {logoPreview && (
                                <div className="mt-2">
                                    <Image
                                        src={logoPreview}
                                        alt={t('logoPreview')}
                                        width={100}
                                        height={100}
                                        className="object-contain"
                                    />
                                </div>
                            )}
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* City Message Section - SuperAdmin Only */}
                {isSuperAdmin && city && (
                    <CityMessageForm 
                        existingMessage={cityMessage}
                        onMessageChange={setMessageData}
                    />
                )}

                <Collapsible
                    open={isDetailsOpen}
                    onOpenChange={setIsDetailsOpen}
                    className="space-y-2"
                >
                    <div className="flex items-center justify-between space-x-4 px-4">
                        <h4 className="text-sm font-semibold">
                            {t('details')}
                        </h4>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="w-9 p-0">
                                {isDetailsOpen ? (
                                    <ChevronUp className="h-4 w-4" />
                                ) : (
                                    <ChevronDown className="h-4 w-4" />
                                )}
                                <span className="sr-only">{t('toggle')}</span>
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="space-y-2">
                        <FormField
                            control={form.control}
                            name="timezone"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('timezone')}</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('selectTimezone')} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {timezones.map((tz) => (
                                                <SelectItem key={tz} value={tz}>
                                                    {tz}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        {t('timezoneDescription')}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('cityId')}</FormLabel>
                                    <FormControl>
                                        <div className="flex items-center">
                                            <span className="mr-2">https://opencouncil.gr/</span>
                                            <Input
                                                {...field}
                                                onChange={(e) => {
                                                    // Use the same transformation function as auto-derivation
                                                    field.onChange(idifyName(e.target.value))
                                                }}
                                            />
                                        </div>
                                    </FormControl>
                                    <FormDescription>
                                        {t('cityIdDescription')}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="supportsNotifications"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">
                                            {t('supportsNotifications')}
                                        </FormLabel>
                                        <FormDescription>
                                            {t('supportsNotificationsDescription')}
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
                    </CollapsibleContent>
                </Collapsible>
                {city && (
                    <Collapsible
                        open={isAdminBodiesOpen}
                        onOpenChange={setIsAdminBodiesOpen}
                        className="space-y-2"
                    >
                        <div className="flex items-center justify-between space-x-4 px-4">
                            <h4 className="text-sm font-semibold">
                                {t('administrativeBodies')}
                            </h4>
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="w-9 p-0">
                                    {isAdminBodiesOpen ? (
                                        <ChevronUp className="h-4 w-4" />
                                    ) : (
                                        <ChevronDown className="h-4 w-4" />
                                    )}
                                    <span className="sr-only">{t('toggle')}</span>
                                </Button>
                            </CollapsibleTrigger>
                        </div>
                        <CollapsibleContent className="space-y-2">
                            <AdministrativeBodiesList
                                cityId={city.id}
                                bodies={administrativeBodies}
                                onUpdate={refreshAdminBodies}
                            />
                        </CollapsibleContent>
                    </Collapsible>
                )}
                <div className="flex justify-between">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t('submitting')}
                            </>
                        ) : (
                            <>{city ? t('updateCity') : t('createCity')}</>
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