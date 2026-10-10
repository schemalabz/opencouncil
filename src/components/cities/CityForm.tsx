"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useValidationMessage, useZodResolver } from "@/hooks/useLocalizedValidation"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { cityFormSchema, cityMessageLinkSchema, CITY_DEFAULTS, createCityFormDataSchema, updateCityRequestFormDataSchema } from "@/lib/zod-schemas/city"
import { toFormData } from "@/lib/utils/formData"
import { apiErrorMessage } from "@/lib/utils/validationIssues"
import { ALL_REALMS, getRealmDisplayName } from "@/lib/realm"
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
import { Loader2, Trash2 } from "lucide-react"
import Image from 'next/image'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import InputWithDerivatives from '@/components/InputWithDerivatives'
// @ts-ignore
import { toPhoneticLatin as toGreeklish } from 'greek-utils'
import AdministrativeBodiesList from './AdministrativeBodiesList'
import CityMessageForm, { MessageFormState } from './CityMessageForm'
import CityBoundaryEditor from './CityBoundaryEditor'
import { ImageCropDialog } from '@/components/ui/ImageCropDialog'
import { CityFormSection } from './CityFormSection'
import { useRealm } from '@/hooks/useRealm'
import { getRealmBaseUrl } from '@/lib/realm'

// Use shared schema from lib/schemas/city.ts
const formSchema = cityFormSchema

// The form sends one body to POST /cities and PUT /cities/{cityId}. POST takes
// the city fields and the logo. PUT also takes the logo removal and the message.
// Every field that POST requires stays required here. Only the logo differs:
// POST requires it, and an edit sends it only when it changes.
type CityRequestFields = Omit<z.input<typeof createCityFormDataSchema>, 'logoImage'> & z.input<typeof updateCityRequestFormDataSchema>

interface CityFormProps {
    city?: City
    cityMessage?: CityMessage | null
    onSuccess?: () => void
}

export default function CityForm({ city, cityMessage, onSuccess }: CityFormProps) {
    const router = useRouter()
    const { data: session } = useSession()
    const [logoImage, setLogoImage] = useState<File | null>(null)
    const [removeLogoImage, setRemoveLogoImage] = useState(false)
    const [cropFile, setCropFile] = useState<File | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [logoPreview, setLogoPreview] = useState<string | null>(city?.logoImage || null)
    const [timezones, setTimezones] = useState<string[]>([])
    const t = useTranslations('CityForm')
    const validationMessage = useValidationMessage()
    const locale = useLocale()
    const [administrativeBodies, setAdministrativeBodies] = useState<Array<{
        id: string;
        name: string;
        name_en: string;
        type: AdministrativeBodyType;
        youtubeChannelUrl?: string | null;
        notificationBehavior?: NotificationBehavior | null;
        diavgeiaUnitIds?: string[];
    }>>([])
    const [boundary, setBoundary] = useState<GeoJSON.Polygon | GeoJSON.MultiPolygon | null>(null)

    // Message data for form submission - only stored when message component updates
    const [messageData, setMessageData] = useState<MessageFormState | null>(null);
    const [messageLinkError, setMessageLinkError] = useState<string | null>(null);

    const isSuperAdmin = session?.user?.isSuperAdmin
    // The slug is shown under the domain it will actually answer on: a city in
    // the France realm lives on the .fr host, not on opencouncil.gr.
    const urlPrefix = `${getRealmBaseUrl(useRealm()).replace(/^https?:\/\//, '')}/`

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

    const form = useForm({
        resolver: useZodResolver(formSchema),
        defaultValues: {
            name: city?.name || "",
            name_en: city?.name_en || "",
            name_municipality: city?.name_municipality || "",
            name_municipality_en: city?.name_municipality_en || "",
            timezone: city?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            id: city?.id || "",
            authorityType: city?.authorityType || CITY_DEFAULTS.authorityType,
            status: city?.status || CITY_DEFAULTS.status,
            supportsNotifications: city?.supportsNotifications ?? CITY_DEFAULTS.supportsNotifications,
            consultationsEnabled: city?.consultationsEnabled ?? CITY_DEFAULTS.consultationsEnabled,
            highlightCreationPermission: city?.highlightCreationPermission || CITY_DEFAULTS.highlightCreationPermission,
            diavgeiaUid: city?.diavgeiaUid || '',
            language: city?.language || CITY_DEFAULTS.language,
            realm: city?.realm || CITY_DEFAULTS.realm,
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

    async function onSubmit(values: z.output<typeof formSchema>) {
        setIsSubmitting(true)
        setFormError(null)
        const url = city ? `/api/cities/${city.id}` : '/api/cities'
        const method = city ? 'PUT' : 'POST'
        // Only a superadmin edits the message. Without a message, only hasMessage is sent.
        const message = isSuperAdmin ? messageData : null
        const shownMessage = message?.hasMessage ? message : null
        // The server refuses the same link. Checked here, the error shows under
        // the link field, and not as a line with the name of the API field.
        const messageLink = shownMessage?.callToActionUrl
            ? cityMessageLinkSchema.safeParse(shownMessage.callToActionUrl)
            : null
        if (messageLink?.error) {
            const linkError = validationMessage(messageLink.error.issues[0].message)
            setMessageLinkError(linkError)
            setFormError(linkError)
            setIsSubmitting(false)
            return
        }
        const formData = toFormData({
            name: values.name,
            name_en: values.name_en,
            name_municipality: values.name_municipality,
            name_municipality_en: values.name_municipality_en,
            timezone: values.timezone,
            id: values.id,
            authorityType: values.authorityType,
            status: values.status,
            supportsNotifications: values.supportsNotifications.toString(),
            consultationsEnabled: values.consultationsEnabled.toString(),
            highlightCreationPermission: values.highlightCreationPermission,
            diavgeiaUid: values.diavgeiaUid || '',
            language: values.language,
            realm: values.realm,
            geometry: boundary ? JSON.stringify(boundary) : undefined,
            logoImage: logoImage ?? undefined,
            removeLogoImage: removeLogoImage && !logoImage ? 'true' : undefined,
            hasMessage: message?.hasMessage.toString(),
            messageEmoji: shownMessage?.emoji,
            messageTitle: shownMessage?.title,
            messageDescription: shownMessage?.description,
            messageCallToActionText: shownMessage ? shownMessage.callToActionText || '' : undefined,
            messageCallToActionUrl: shownMessage ? shownMessage.callToActionUrl || '' : undefined,
            messageCallToActionExternal: shownMessage?.callToActionExternal.toString(),
            messageIsActive: shownMessage?.isActive.toString(),
        } satisfies CityRequestFields)

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
                throw new Error(apiErrorMessage(errorData, t('failedToSaveCity'), validationMessage))
            }
        } catch (error) {
            console.error(t('failedToSaveCity'), error)
            setFormError(error instanceof Error ? error.message : t('unexpectedError'))
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleCroppedLogo = (file: File) => {
        setLogoImage(file)
        form.setValue('logoImage', file)
        setRemoveLogoImage(false)
        const reader = new FileReader()
        reader.onloadend = () => {
            setLogoPreview(reader.result as string)
        }
        reader.readAsDataURL(file)
        setCropFile(null)
    }

    const handleRemoveLogo = () => {
        setLogoImage(null)
        form.setValue('logoImage', undefined)
        setLogoPreview(null)
        setRemoveLogoImage(true)
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
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                {formError && (
                    <div className="rounded-[8px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {formError}
                    </div>
                )}

                <CityFormSection title={t('sectionIdentity')} hint={t('sectionIdentityHint')} defaultOpen>
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
                                        <SelectItem value="municipality">{t('municipality')}</SelectItem>
                                        <SelectItem value="region">{t('region')}</SelectItem>
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
                        render={() => (
                            <FormItem>
                                <FormLabel>{t('logoImage')}</FormLabel>
                                <FormControl>
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) setCropFile(file)
                                            e.target.value = ''
                                        }}
                                    />
                                </FormControl>
                                {!logoPreview && (
                                    <FormDescription>
                                        {t('logoImageDescription')}
                                    </FormDescription>
                                )}
                                {logoPreview && (
                                    <div className="mt-2 flex items-end gap-2">
                                        <Image
                                            src={logoPreview}
                                            alt={t('logoPreview')}
                                            width={100}
                                            height={100}
                                            className="object-contain"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            aria-label="Remove logo"
                                            onClick={handleRemoveLogo}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </CityFormSection>

                <CityFormSection title={t('sectionSettings')} hint={t('sectionSettingsHint')}>
                    <FormField
                        control={form.control}
                        name="id"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('cityId')}</FormLabel>
                                <FormControl>
                                    <div className="flex items-center gap-1">
                                        <span className="shrink-0 text-sm text-muted-foreground">{urlPrefix}</span>
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
                        name="diavgeiaUid"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('diavgeiaUid')}</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder={t('diavgeiaUidPlaceholder')}
                                        {...field}
                                    />
                                </FormControl>
                                <FormDescription>
                                    {t('diavgeiaUidDescription')}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="supportsNotifications"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between gap-4 rounded-[8px] border border-border p-3">
                                <div className="space-y-0.5">
                                    <FormLabel>{t('supportsNotifications')}</FormLabel>
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
                    <FormField
                        control={form.control}
                        name="consultationsEnabled"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between gap-4 rounded-[8px] border border-border p-3">
                                <div className="space-y-0.5">
                                    <FormLabel>{t('consultationsEnabled')}</FormLabel>
                                    <FormDescription>
                                        {t('consultationsEnabledDescription')}
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
                </CityFormSection>

                <CityFormSection title={t('boundary')} hint={t('boundaryDescription')}>
                    <CityBoundaryEditor cityId={city?.id} onBoundaryChange={setBoundary} />
                </CityFormSection>

                {city && (
                    <CityFormSection title={t('administrativeBodies')} hint={t('administrativeBodiesHint')}>
                        <AdministrativeBodiesList
                            cityId={city.id}
                            bodies={administrativeBodies}
                            onUpdate={refreshAdminBodies}
                        />
                    </CityFormSection>
                )}

                {isSuperAdmin && city && (
                    <CityMessageForm
                        existingMessage={cityMessage}
                        onMessageChange={(data) => {
                            setMessageData(data)
                            setMessageLinkError(null)
                        }}
                        callToActionUrlError={messageLinkError}
                    />
                )}

                {isSuperAdmin && (
                    <CityFormSection title={t('adminSettings')} hint={t('adminSettingsHint')} restricted>
                        <FormField
                            control={form.control}
                            name="status"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('status')}</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('selectStatus')} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="pending">{t('statusPending')}</SelectItem>
                                            <SelectItem value="demo">{t('statusDemo')}</SelectItem>
                                            <SelectItem value="supported">{t('statusSupported')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        {t('statusDescription')}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="highlightCreationPermission"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('highlightCreationPermission')}</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('selectHighlightCreationPermission')} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="ADMINS_ONLY">{t('highlightCreationAdminsOnly')}</SelectItem>
                                            <SelectItem value="EVERYONE">{t('highlightCreationEveryone')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        {t('highlightCreationPermissionDescription')}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="realm"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('realm')}</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('selectRealm')} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {ALL_REALMS.map((realm) => (
                                                <SelectItem key={realm} value={realm}>{getRealmDisplayName(realm, locale)}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        {t('realmDescription')}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="language"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('language')}</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('selectLanguage')} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="el">{t('languageGreek')}</SelectItem>
                                            <SelectItem value="fr">{t('languageFrench')}</SelectItem>
                                            <SelectItem value="sr">{t('languageSerbian')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        {t('languageDescription')}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CityFormSection>
                )}

                <ImageCropDialog
                    file={cropFile}
                    cropShape="rect"
                    title={t('logoImage')}
                    onCancel={() => setCropFile(null)}
                    onConfirm={handleCroppedLogo}
                />

                {/* Pinned: the sheet is six sections tall with everything open, and
                    the button that commits them should never be the thing you have
                    to scroll back to. */}
                <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
                    <SheetClose asChild>
                        <Button type="button" variant="ghost">{t('cancel')}</Button>
                    </SheetClose>
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
                </div>
            </form>
        </Form>
    )
}
