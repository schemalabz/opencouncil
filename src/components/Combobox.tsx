"use client";

import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button"
import { Check, ChevronsUpDown } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils";

type ComboboxVariant = "default" | "minimal";

export default function Combobox({ 
    options, 
    value, 
    onChange, 
    placeholder, 
    className, 
    disabled = false, 
    loading = false,
    variant = "default"
}: {
    options: string[],
    value: string | null,
    onChange: (value: string | null) => void,
    placeholder: string,
    className?: string,
    disabled?: boolean,
    loading?: boolean,
    variant?: ComboboxVariant
}) {
    const [open, setOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Check if we're on mobile
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768); // 768px is the standard md breakpoint
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const buttonStyles = {
        default: "justify-between text-ellipsis text-xs overflow-hidden",
        minimal: "bg-transparent border-none outline-none text-sm font-medium text-[hsl(var(--orange))] hover:text-[hsl(var(--accent))] px-2 py-1 rounded-md cursor-pointer focus:ring-0 focus:outline-none transition-colors h-auto"
    };

    const renderContent = () => (
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
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
    );

    const trigger = (
        <Button
            variant={variant === "default" ? "outline" : "ghost"}
            role="combobox"
            aria-expanded={open}
            className={cn(
                buttonStyles[variant],
                disabled ? "opacity-50 cursor-not-allowed" : "",
                className
            )}
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
                    <ChevronsUpDown className={cn(
                        "ml-2 h-4 w-4 shrink-0 opacity-50",
                        variant === "minimal" && "text-[hsl(var(--orange))]"
                    )} />
                </>
            )}
        </Button>
    );

    if (isMobile) {
        return (
            <>
                <div onClick={() => !disabled && !loading && setOpen(true)}>
                    {trigger}
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogContent className="sm:max-w-[425px] overflow-hidden p-0">
                        <DialogHeader className="px-4 pt-4">
                            <DialogTitle>{placeholder}</DialogTitle>
                        </DialogHeader>
                        {renderContent()}
                    </DialogContent>
                </Dialog>
            </>
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                {trigger}
            </PopoverTrigger>
            <PopoverContent className={cn("p-0", className)}>
                {renderContent()}
            </PopoverContent>
        </Popover>
    );
}