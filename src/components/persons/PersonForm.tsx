"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "../../components/ui/button"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "../../components/ui/form"
import { Input } from "../../components/ui/input"
import { SheetClose } from "../../components/ui/sheet"
import { Party, Person, Role, AdministrativeBody } from '@prisma/client'
import { RoleWithRelations } from '@/lib/db/types'
import { Loader2, Check } from "lucide-react"
import { useTranslations } from 'next-intl'
import React, { useRef } from "react"
import InputWithDerivatives from "../../components/InputWithDerivatives"
// @ts-ignore
import { toPhoneticLatin as toGreeklish } from 'greek-utils'
import { useToast } from "@/hooks/use-toast"
import RolesList from './RolesList'

const formSchema = z.object({
    name: z.string().min(2, {
        message: "Person name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "Person name (English) must be at least 2 characters.",
    }),
    name_short: z.string().min(2, {
        message: "Short name must be at least 2 characters.",
    }),
    name_short_en: z.string().min(2, {
        message: "Short name (English) must be at least 2 characters.",
    }),
    image: z.instanceof(File).optional(),
    profileUrl: z.string().url().optional().or(z.literal('')),
})

interface PersonFormProps {
    person?: Person & { roles?: RoleWithRelations[] }
    onSuccess?: () => void
    cityId: string,
    parties: Party[]
    administrativeBodies: AdministrativeBody[]
}

export default function PersonForm({ person, parties, administrativeBodies, onSuccess, cityId }: PersonFormProps) {
    const router = useRouter()
    const [image, setImage] = useState<File | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [imagePreview, setImagePreview] = useState<string | null>(person?.image || null)
    const [roles, setRoles] = useState<RoleWithRelations[]>(person?.roles || [])
    const t = useTranslations('PersonForm')
    const { toast } = useToast()
    const nameInputRef = useRef<HTMLInputElement>(null)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: person?.name || "",
            name_en: person?.name_en || "",
            name_short: person?.name_short || "",
            name_short_en: person?.name_short_en || "",
            profileUrl: person?.profileUrl || "",
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true)
        const url = person ? `/api/cities/${cityId}/people/${person.id}` : `/api/cities/${cityId}/people`
        const method = person ? 'PUT' : 'POST'

        // Validate image size
        if (image && image.size > 5 * 1024 * 1024) { // 5MB limit
            toast({
                title: t('error'),
                description: 'Image size must be less than 5MB',
                variant: "destructive",
            })
            setIsSubmitting(false)
            return
        }

        const formData = new FormData()
        console.log('Creating FormData object...')

        // Append all form values
        formData.append('name', values.name)
        formData.append('name_en', values.name_en)
        formData.append('name_short', values.name_short)
        formData.append('name_short_en', values.name_short_en)
        formData.append('cityId', cityId)
        formData.append('profileUrl', values.profileUrl || "")

        // Clean up roles data before sending
        const cleanRoles = roles.map(role => ({
            id: role.id,
            personId: role.personId,
            cityId: role.cityId,
            partyId: role.partyId,
            administrativeBodyId: role.administrativeBodyId,
            isHead: role.isHead,
            name: role.name,
            name_en: role.name_en,
            startDate: role.startDate,
            endDate: role.endDate,
            rank: role.rank
        }))

        console.log('Roles to be sent:', cleanRoles)
        formData.append('roles', JSON.stringify(cleanRoles))

        // Only append image if it exists and is valid
        if (image) {
            console.log('Appending image:', image.name, image.size)
            formData.append('image', image)
        }

        console.log('FormData created, sending request to:', url)

        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

            const response = await fetch(url, {
                method,
                body: formData,
                signal: controller.signal
            })

            clearTimeout(timeoutId)
            console.log('Response received:', response.status)

            if (response.ok) {
                setIsSuccess(true)
                setTimeout(() => setIsSuccess(false), 1000)
                if (onSuccess) {
                    onSuccess()
                }
                router.refresh() // Refresh the page to show updated data

                // Only reset form if it's a new person (not in edit mode)
                if (!person) {
                    form.reset({
                        name: "",
                        name_en: "",
                        name_short: "",
                        name_short_en: "",
                        image: undefined,
                        profileUrl: "",
                    })
                    setImage(null)
                    setImagePreview(null)
                    // Do not reset roles ever, for easier data entry
                    // setRoles([])
                    nameInputRef.current?.focus()
                }

                toast({
                    title: t('success'),
                    description: person ? t('personUpdated') : t('personCreated'),
                })
            } else {
                const errorData = await response.json()
                throw new Error(errorData.message || t('failedToSavePerson'))
            }
        } catch (error) {
            console.error('Error in form submission:', error)
            toast({
                title: t('error'),
                description: error instanceof Error
                    ? (error.name === 'AbortError'
                        ? 'Request timed out. Please try again.'
                        : error.message)
                    : t('unexpectedError'),
                variant: "destructive",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const shorterName = (name: string) => {
        const names = name.split(' ');
        if (names.length > 1) {
            return `${names[0][0]}. ${names[names.length - 1]}`;
        }
        return name;
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                <InputWithDerivatives
                    baseName="name"
                    basePlaceholder={t('personNamePlaceholder')}
                    baseDescription={t('personNameDescription')}
                    derivatives={[
                        {
                            name: 'name_en',
                            calculate: (baseValue) => toGreeklish(baseValue),
                            placeholder: t('personNameEnPlaceholder'),
                            description: t('personNameEnDescription'),
                        },
                        {
                            name: 'name_short',
                            calculate: shorterName,
                            placeholder: t('personShortNamePlaceholder'),
                            description: t('personShortNameDescription'),
                        },
                        {
                            name: 'name_short_en',
                            calculate: (name) => toGreeklish(shorterName(name)),
                            placeholder: t('personShortNameEnPlaceholder'),
                            description: t('personShortNameEnDescription'),
                        },
                    ]}
                    form={form}
                />

                <FormField
                    control={form.control}
                    name="image"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('image')}</FormLabel>
                            <FormControl>
                                <Input type="file" onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        setImage(e.target.files[0])
                                        setImagePreview(URL.createObjectURL(e.target.files[0]))
                                    }
                                }} />
                            </FormControl>
                            {imagePreview && <Image src={imagePreview} alt="Image preview" width={200} height={200} className="mt-2 object-contain" unoptimized />}
                            <FormDescription>
                                {t('imageDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="profileUrl"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('profileUrl')}</FormLabel>
                            <FormControl>
                                <Input {...field} type="url" placeholder="https://..." />
                            </FormControl>
                            <FormDescription>
                                {t('profileUrlDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="space-y-2">
                    <h3 className="text-lg font-medium">{t('roles')}</h3>
                    <RolesList
                        personId={person?.id}
                        cityId={cityId}
                        roles={roles}
                        parties={parties}
                        administrativeBodies={administrativeBodies}
                        onUpdate={setRoles}
                    />
                </div>

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
                            <>{person ? t('updatePerson') : t('createPerson')}</>
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
