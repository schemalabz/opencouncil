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
import { Party } from '@prisma/client'
import { Loader2 } from "lucide-react"
import { useTranslations } from 'next-intl'
import InputWithDerivatives from '../../components/InputWithDerivatives'
import React from "react";
// @ts-ignore
import { HexColorPicker, HexColorInput } from "react-colorful";

const formSchema = z.object({
    name: z.string().min(2, {
        message: "Party name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "Party name (English) must be at least 2 characters.",
    }),
    name_short: z.string().min(2, {
        message: "Short name must be at least 2 characters.",
    }),
    name_short_en: z.string().min(2, {
        message: "Short name (English) must be at least 2 characters.",
    }),
    colorHex: z.string().min(4, {
        message: "Color Hex must be at least 4 characters.",
    }),
    logo: z.instanceof(File).optional(),
})

interface PartyFormProps {
    party?: Party
    onSuccess?: () => void
    cityId: string
}

export default function PartyForm({ party, onSuccess, cityId }: PartyFormProps) {
    const router = useRouter()
    const [logo, setLogo] = useState<File | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [logoPreview, setLogoPreview] = useState<string | null>(party?.logo || null)
    const t = useTranslations('PartyForm')

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: party?.name || "",
            name_en: party?.name_en || "",
            name_short: party?.name_short || "",
            name_short_en: party?.name_short_en || "",
            colorHex: party?.colorHex || "",
        },
    })
    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true)
        setFormError(null)
        const url = party ? `/api/cities/${cityId}/parties/${party.id}` : `/api/cities/${cityId}/parties`
        const method = party ? 'PUT' : 'POST'

        const formData = new FormData()

        // Append all form values
        formData.append('name', values.name)
        formData.append('name_en', values.name_en)
        formData.append('name_short', values.name_short)
        formData.append('name_short_en', values.name_short_en)
        formData.append('colorHex', values.colorHex)
        formData.append('cityId', cityId)

        // Append logo if it exists
        if (logo) {
            formData.append('logo', logo)
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
                throw new Error(errorData.message || t('failedToSaveParty'))
            }
        } catch (error) {
            console.error(t('failedToSaveParty'), error)
            setFormError(error instanceof Error ? error.message : t('unexpectedError'))
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <InputWithDerivatives
                    baseName="name"
                    basePlaceholder={t('partyNamePlaceholder')}
                    baseDescription={t('partyNameDescription')}
                    derivatives={[
                        {
                            name: 'name_en',
                            calculate: (baseValue) => baseValue,
                            placeholder: t('partyNameEnPlaceholder'),
                            description: t('partyNameEnDescription'),
                        },
                        {
                            name: 'name_short',
                            calculate: (baseValue) => baseValue,
                            placeholder: t('partyShortNamePlaceholder'),
                            description: t('partyShortNameDescription'),
                        },
                        {
                            name: 'name_short_en',
                            calculate: (baseValue) => baseValue,
                            placeholder: t('partyShortNameEnPlaceholder'),
                            description: t('partyShortNameEnDescription'),
                        },
                    ]}
                    form={form}
                />

                <FormField
                    control={form.control}
                    name="logo"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('logo')}</FormLabel>
                            <FormControl>
                                <Input type="file" onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        setLogo(e.target.files[0])
                                        setLogoPreview(URL.createObjectURL(e.target.files[0]))
                                    }
                                }} />
                            </FormControl>
                            {logoPreview && <Image src={logoPreview} alt="Logo preview" width={200} height={200} className="mt-2 object-contain" unoptimized />}
                            <FormDescription>
                                {t('logoDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="colorHex"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('colorHex')}</FormLabel>
                            <FormControl>
                                <>
                                    <div className="flex justify-center">
                                        <details className="w-full">
                                            <summary className="cursor-pointer text-center py-2 bg-gray-200 rounded-md">Pick a Color</summary>
                                            <div className="flex justify-center py-4">
                                                <HexColorPicker color={field.value} onChange={field.onChange} />
                                            </div>
                                        </details>
                                    </div>
                                    <Input {...field} />
                                </>
                            </FormControl>
                            <FormDescription>
                                {t('colorHexDescription')}
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
                        ) : (
                            <>{party ? t('updateParty') : t('createParty')}</>
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


