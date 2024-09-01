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
import { Party, Person } from '@prisma/client'
import { Loader2 } from "lucide-react"
import { useTranslations } from 'next-intl'
import React from "react";
import InputWithDerivatives from "../../components/InputWithDerivatives";
// @ts-ignore
import { toGreeklish } from 'greek-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
    role: z.string().optional(),
    role_en: z.string().optional(),
    image: z.instanceof(File).optional(),
    partyId: z.string().optional(),
})

interface PersonFormProps {
    person?: Person
    onSuccess?: () => void
    cityId: string,
    parties: Party[]
}

export default function PersonForm({ person, parties, onSuccess, cityId }: PersonFormProps) {
    const router = useRouter()
    const [image, setImage] = useState<File | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(person?.image || null)
    const t = useTranslations('PersonForm')

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: person?.name || "",
            name_en: person?.name_en || "",
            name_short: person?.name_short || "",
            name_short_en: person?.name_short_en || "",
            role: person?.role || "",
            role_en: person?.role_en || "",
            partyId: person?.partyId || "",
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true)
        setFormError(null)
        const url = person ? `/api/cities/${cityId}/people/${person.id}` : `/api/cities/${cityId}/people`
        const method = person ? 'PUT' : 'POST'

        const formData = new FormData()
        formData.append('name', values.name)
        formData.append('name_en', values.name_en)
        formData.append('name_short', values.name_short)
        formData.append('name_short_en', values.name_short_en)
        formData.append('role', values.role || "")
        formData.append('role_en', values.role_en || "")
        if (image) {
            formData.append('image', image)
        }
        formData.append('cityId', cityId)
        formData.append('partyId', values.partyId || "")

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
                throw new Error(errorData.message || t('failedToSavePerson'))
            }
        } catch (error) {
            console.error(t('failedToSavePerson'), error)
            setFormError(error instanceof Error ? error.message : t('unexpectedError'))
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
                <InputWithDerivatives
                    baseName="role"
                    basePlaceholder={t('rolePlaceholder')}
                    baseDescription={t('roleDescription')}
                    derivatives={[
                        {
                            name: 'role_en',
                            calculate: (baseValue) => toGreeklish(baseValue),
                            placeholder: t('roleEnPlaceholder'),
                            description: t('roleEnDescription'),
                        },
                    ]}
                    form={form}
                />
                <FormField
                    control={form.control}
                    name="partyId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('party')}</FormLabel>
                            <FormControl>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('selectParty')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {parties.map((party) => (
                                            <SelectItem key={party.id} value={party.id}>
                                                {party.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FormControl>
                            <FormDescription>
                                {t('partyDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
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
                            {imagePreview && <img src={imagePreview} alt="Image preview" className="mt-2" />}
                            <FormDescription>
                                {t('imageDescription')}
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
