"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button"
import { ChevronsUpDown, Search, X } from "lucide-react"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList, CommandGroup } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils";

type ComboboxGroup<T> = {
    key: string;
    label: string;
    items: T[];
    icon?: React.ComponentType;
}

type ComboboxProps<T> = {
    // Core props
    items: T[];
    value: T | null;
    onChange: (value: T | null) => void;
    placeholder: string;
    searchPlaceholder?: string;
    
    // Item rendering
    getItemLabel: (item: T) => string;
    getItemValue: (item: T) => string;
    ItemComponent?: React.ComponentType<{ item: T }>;
    
    // Groups
    groups?: ComboboxGroup<T>[];
    
    // Custom trigger
    TriggerComponent?: React.ComponentType<{
        item: T | null;
        placeholder: string;
        isOpen: boolean;
        onClear?: () => void;
    }>;
    
    // Optional props
    className?: string;
    disabled?: boolean;
    loading?: boolean;
    clearable?: boolean;
    emptyMessage?: string;
    variant?: 'default' | 'minimal';
}

export default function Combobox<T>({ 
    items,
    value,
    onChange,
    placeholder,
    searchPlaceholder,
    getItemLabel,
    getItemValue,
    ItemComponent,
    groups,
    TriggerComponent,
    className,
    disabled = false,
    loading = false,
    clearable = false,
    emptyMessage = "No results found.",
    variant = 'default'
}: ComboboxProps<T>) {
    const [open, setOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Check if we're on mobile
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Default item component
    const defaultItemComponent = ({ item }: { item: T }) => (
        <div className="flex items-center">
            <span>{getItemLabel(item)}</span>
        </div>
    );

    // Default trigger component
    const DefaultTriggerComponent = ({ item, placeholder, isOpen, onClear }: {
        item: T | null;
        placeholder: string;
        isOpen: boolean;
        onClear?: () => void;
    }) => (
        <Button
            variant={variant === 'minimal' ? 'ghost' : 'outline'}
            role="combobox"
            aria-expanded={open}
            className={cn(
                "w-full justify-between",
                variant === 'minimal' ? "h-8 px-2" : "h-10",
                disabled && "opacity-50 cursor-not-allowed"
            )}
            disabled={disabled || loading}
        >
            <span className="truncate">
                {item ? getItemLabel(item) : placeholder}
            </span>
            <div className="flex items-center gap-2">
                {item && clearable && onClear && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-full"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClear();
                        }}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                )}
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
        </Button>
    );

    // Prepare groups with type safety
    const effectiveGroups = useMemo(() => {
        if (!groups) {
            return [{
                key: 'default',
                label: '',
                items: items.filter(item => item != null)
            }];
        }
        return groups.map(group => ({
            ...group,
            items: group.items.filter(item => item != null)
        }));
    }, [groups, items]);


    const renderContent = () => (
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
            <div className="flex items-center px-3 border-b">
                <CommandInput
                    placeholder={searchPlaceholder || placeholder}
                    className="h-12 flex-1"
                />
            </div>
            <CommandList>
                <CommandEmpty>
                    <div className="py-6 text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-100 text-orange-600 mb-3">
                            <Search className="h-6 w-6" />
                        </div>
                        <p className="text-sm text-gray-500">{emptyMessage}</p>
                    </div>
                </CommandEmpty>

                {effectiveGroups.map((group) => (
                    <CommandGroup key={group.key} heading={group.label}>
                        {group.items.map((item) => {
                            const itemValue = getItemValue(item);
                            if (!itemValue) return null;

                            return (
                                <CommandItem
                                    key={itemValue}
                                    value={itemValue}
                                    onSelect={() => {
                                        onChange(item === value ? null : item);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        "w-full justify-start text-sm h-auto py-2 px-2 rounded-md transition-colors duration-200",
                                        value === item ? "bg-orange-100 text-orange-700" : "hover:bg-accent/50"
                                    )}
                                >
                                    {ItemComponent ? <ItemComponent item={item} /> : defaultItemComponent({ item })}
                                </CommandItem>
                            );
                        })}
                    </CommandGroup>
                ))}
            </CommandList>
        </Command>
    );

    const trigger = (
        <div 
            onClick={() => !disabled && !loading && setOpen(true)}
            className={disabled ? "pointer-events-none" : undefined}
        >
            {TriggerComponent ? (
                <TriggerComponent
                    item={value}
                    placeholder={placeholder}
                    isOpen={open}
                    onClear={clearable ? () => onChange(null) : undefined}
                />
            ) : (
                <DefaultTriggerComponent
                    item={value}
                    placeholder={placeholder}
                    isOpen={open}
                    onClear={clearable ? () => onChange(null) : undefined}
                />
            )}
        </div>
    );

    if (isMobile) {
        return (
            <>
                {trigger}
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