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
import { Loader2, Check, CalendarIcon } from "lucide-react"
import { useTranslations } from 'next-intl'
import React, { useRef } from "react"
import InputWithDerivatives from "../../components/InputWithDerivatives"
// @ts-ignore
import { toPhoneticLatin as toGreeklish } from 'greek-utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Switch } from '../ui/switch'
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

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
    isAdministrativeRole: z.boolean().optional(),
    activeFrom: z.date().nullable(),
    activeTo: z.date().nullable(),
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
    const [isSuccess, setIsSuccess] = useState(false)
    const [imagePreview, setImagePreview] = useState<string | null>(person?.image || null)
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
            role: person?.role || "",
            role_en: person?.role_en || "",
            partyId: person?.partyId || "",
            isAdministrativeRole: person?.isAdministrativeRole || false,
            activeFrom: person?.activeFrom || null,
            activeTo: person?.activeTo || null,
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsSubmitting(true)
        const url = person ? `/api/cities/${cityId}/people/${person.id}` : `/api/cities/${cityId}/people`
        const method = person ? 'PUT' : 'POST'
        const jsonData = {
            name: values.name,
            name_en: values.name_en,
            name_short: values.name_short,
            name_short_en: values.name_short_en,
            role: values.role || "",
            role_en: values.role_en || "",
            image: image,
            cityId: cityId,
            partyId: values.partyId || "",
            isAdministrativeRole: values.isAdministrativeRole || false,
            activeFrom: values.activeFrom,
            activeTo: values.activeTo,
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
                setIsSuccess(true)
                setTimeout(() => setIsSuccess(false), 1000)
                if (onSuccess) {
                    onSuccess()
                }
                router.refresh() // Refresh the page to show updated data
                form.reset({
                    name: "",
                    name_en: "",
                    name_short: "",
                    name_short_en: "",
                    role: "",
                    role_en: "",
                    image: undefined,
                    partyId: values.partyId,
                    isAdministrativeRole: false,
                    activeFrom: null,
                    activeTo: null,
                })
                setImage(null)
                setImagePreview(null)
                nameInputRef.current?.focus()
                toast({
                    title: t('success'),
                    description: person ? t('personUpdated') : t('personCreated'),
                })
            } else {
                const errorData = await response.json()
                throw new Error(errorData.message || t('failedToSavePerson'))
            }
        } catch (error) {
            console.error(t('failedToSavePerson'), error)
            toast({
                title: t('error'),
                description: error instanceof Error ? error.message : t('unexpectedError'),
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
                                        <SelectItem value="">
                                            {t('noParty')}
                                        </SelectItem>
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
                <FormField
                    control={form.control}
                    name="isAdministrativeRole"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('isAdministrativeRole')}</FormLabel>
                            <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormDescription>
                                {t('isAdministrativeRoleDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="activeFrom"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>{t('activeFrom')}</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                                "w-[240px] pl-3 text-left font-normal",
                                                !field.value && "text-muted-foreground"
                                            )}
                                        >
                                            {field.value ? (
                                                format(field.value, "PPP")
                                            ) : (
                                                <span>{t('pickADate')}</span>
                                            )}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={field.value || undefined}
                                        onSelect={field.onChange}
                                        disabled={(date) =>
                                            date > new Date() || date < new Date("1900-01-01")
                                        }
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            <FormDescription>{t('activeFromDescription')}</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="activeTo"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>{t('activeTo')}</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                                "w-[240px] pl-3 text-left font-normal",
                                                !field.value && "text-muted-foreground"
                                            )}
                                        >
                                            {field.value ? (
                                                format(field.value, "PPP")
                                            ) : (
                                                <span>{t('pickADate')}</span>
                                            )}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={field.value || undefined}
                                        onSelect={(date) => field.onChange(date)}
                                        disabled={(date) =>
                                            date > new Date() || date < new Date("1900-01-01")
                                        }
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            <FormDescription>{t('activeToDescription')}</FormDescription>
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
