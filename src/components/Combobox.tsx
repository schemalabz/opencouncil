"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button"
import { Check, ChevronsUpDown } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils";

export default function Combobox({ options, value, onChange, placeholder, className, disabled = false, loading = false }: {
    options: string[],
    value: string | null,
    onChange: (value: string | null) => void,
    placeholder: string,
    className?: string,
    disabled?: boolean
    loading?: boolean
}) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("justify-between text-ellipsis text-xs overflow-hidden", disabled ? "opacity-50 cursor-not-allowed" : "", className)}
                    disabled={disabled || loading}
                >
                    {loading ? (
                        <div className="flex items-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mr-2"></div>
                            Loading...
                        </div>
                    ) : (
                        <>
                            {value ?? placeholder}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className={cn("p-0", className)}>
                <Command>
                    <CommandInput placeholder={placeholder} />
                    <CommandList>
                        <CommandEmpty>No result found.</CommandEmpty>
                        <CommandGroup>
                            {loading ? (
                                <div className="flex items-center justify-center py-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
                                </div>
                            ) : (
                                options.map((option) => (
                                    <CommandItem
                                        key={option}
                                        onSelect={() => {
                                            onChange(option === value ? null : option)
                                            setOpen(false)
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === option ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {option}
                                    </CommandItem>
                                ))
                            )}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}