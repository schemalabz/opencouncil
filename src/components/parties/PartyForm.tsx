"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import type * as z from "zod"
import { partyFormDataSchema, partyFormSchema, type PartyFormInput, type PartyFormOutput } from "@/lib/zod-schemas/party"
import { toFormData } from "@/lib/utils/formData"
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
import { ImageCropDialog } from "@/components/ui/ImageCropDialog"
import { Party } from '@prisma/client'
import { Loader2, Trash2 } from "lucide-react"
import { useTranslations } from 'next-intl'
import InputWithDerivatives from '../../components/InputWithDerivatives'
import React from "react";
// @ts-ignore
import { HexColorPicker, HexColorInput } from "react-colorful";


interface PartyFormProps {
    party?: Party
    onSuccess?: () => void
    cityId: string
}

export default function PartyForm({ party, onSuccess, cityId }: PartyFormProps) {
    const router = useRouter()
    const [logo, setLogo] = useState<File | null>(null)
    const [removeLogo, setRemoveLogo] = useState(false)
    const [cropFile, setCropFile] = useState<File | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [logoPreview, setLogoPreview] = useState<string | null>(party?.logo || null)
    const t = useTranslations('PartyForm')

    const form = useForm<PartyFormInput, unknown, PartyFormOutput>({
        resolver: zodResolver(partyFormSchema),
        defaultValues: {
            name: party?.name || "",
            name_en: party?.name_en || "",
            name_short: party?.name_short || "",
            name_short_en: party?.name_short_en || "",
            colorHex: party?.colorHex || "",
        },
    })
    async function onSubmit(values: PartyFormOutput) {
        setIsSubmitting(true)
        setFormError(null)
        const url = party ? `/api/cities/${cityId}/parties/${party.id}` : `/api/cities/${cityId}/parties`
        const method = party ? 'PUT' : 'POST'

        const formData = toFormData({
            name: values.name,
            name_en: values.name_en,
            name_short: values.name_short,
            name_short_en: values.name_short_en,
            colorHex: values.colorHex,
            logo: logo ?? undefined,
            // Signal removal of an existing logo
            removeLogo: removeLogo && !logo ? 'true' : undefined,
        } satisfies z.input<typeof partyFormDataSchema>)

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
                                <Input type="file" accept="image/*" onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) setCropFile(file)
                                    e.target.value = ''
                                }} />
                            </FormControl>
                            {logoPreview && (
                                <div className="mt-2 flex items-end gap-2">
                                    <Image src={logoPreview} alt="Logo preview" width={200} height={200} className="object-contain" unoptimized />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        aria-label="Remove logo"
                                        onClick={() => {
                                            setLogo(null)
                                            setLogoPreview(null)
                                            setRemoveLogo(true)
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                            {!logoPreview && (
                                <FormDescription>
                                    {t('logoDescription')}
                                </FormDescription>
                            )}
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <ImageCropDialog
                    file={cropFile}
                    cropShape="rect"
                    title={t('logo')}
                    onCancel={() => setCropFile(null)}
                    onConfirm={(processed) => {
                        setLogo(processed)
                        setLogoPreview(URL.createObjectURL(processed))
                        setRemoveLogo(false)
                        setCropFile(null)
                    }}
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
                                            <summary className="cursor-pointer text-center py-2 bg-gray-200 rounded-md">{t('pickColor')}</summary>
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


