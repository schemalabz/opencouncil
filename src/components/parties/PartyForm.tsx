"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

        const jsonData: {
            name: string;
            name_en: string;
            name_short: string;
            name_short_en: string;
            colorHex: string;
            logo?: string | File;
            cityId: string;
        } = {
            name: values.name,
            name_en: values.name_en,
            name_short: values.name_short,
            name_short_en: values.name_short_en,
            colorHex: values.colorHex,
            logo: logo!,
            cityId: cityId
        }

        if (logo) {
            // Convert logo to base64
            const reader = new FileReader();
            reader.readAsDataURL(logo);
            await new Promise<void>((resolve) => {
                reader.onload = () => {
                    if (typeof reader.result === 'string') {
                        jsonData.logo = reader.result;
                    }
                    resolve();
                };
            });
        }

        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(jsonData),
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


