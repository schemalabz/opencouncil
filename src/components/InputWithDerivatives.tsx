import { useState } from "react"
import { useTranslations } from "next-intl"
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "./ui/form"
import { Input } from "./ui/input"
import React from "react"

export interface DerivativeConfig {
    name: string
    calculate: (baseValue: string) => string
    placeholder: string
    description: string
}

export interface InputWithDerivativesProps {
    baseName: string
    basePlaceholder: string
    baseDescription: string
    derivatives: DerivativeConfig[]
    form: any
}

export default function InputWithDerivatives({ baseName, basePlaceholder, baseDescription, derivatives, form }: InputWithDerivativesProps) {
    const [isEdited, setIsEdited] = useState<{ [key: string]: boolean }>({})
    const t = useTranslations('InputWithDerivatives')

    const handleBaseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const baseValue = e.target.value
        form.setValue(baseName, baseValue)
        derivatives.forEach(({ name, calculate }) => {
            if (!isEdited[name]) {
                if (baseValue === '') {
                    form.setValue(name, '')
                } else {
                    form.setValue(name, calculate(baseValue))
                }
            }
        })
    }

    return (
        <>
            <FormField
                control={form.control}
                name={baseName}
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>{form.getValues(`${baseName}Label`)}</FormLabel>
                        <FormControl>
                            <Input placeholder={basePlaceholder} {...field} onChange={handleBaseChange} />
                        </FormControl>
                        <FormDescription>
                            {baseDescription}
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <div className="border-l-2 border-muted-foreground pl-4">
                <p className="text-muted-foreground">{t('derivedFields')}</p>
                {derivatives.map(({ name, placeholder, description }) => (
                    <FormField
                        key={name}
                        control={form.control}
                        name={name}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-muted-foreground">{form.getValues(`${name}Label`)}</FormLabel>
                                <FormControl>
                                    <Input
                                        className="bg-muted"
                                        placeholder={placeholder}
                                        {...field}
                                        onChange={(e) => {
                                            setIsEdited((prev) => ({ ...prev, [name]: true }))
                                            field.onChange(e.target.value)
                                        }}
                                    />
                                </FormControl>
                                <FormDescription className="text-muted-foreground">
                                    {description}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ))}
            </div>
        </>
    )
}