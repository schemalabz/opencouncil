import { ChevronDown } from "lucide-react";
import { Button } from "./button";
import { Badge } from "./badge";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
} from "./dropdown-menu";
import { useState } from "react";

export interface Option<T> {
    value: T;
    label: string;
}

interface MultiSelectDropdownProps<T> {
    options: Option<T>[];
    onChange?: (values: T[]) => void;
    defaultValues?: T[];
    className?: string;
    placeholder?: string;
    allText?: string;
}

export function MultiSelectDropdown<T>({
    options,
    onChange,
    defaultValues = [],
    className,
    placeholder = "Select options...",
    allText = "Όλα"
}: MultiSelectDropdownProps<T>) {
    const [selectedValues, setSelectedValues] = useState<T[]>(defaultValues);

    const handleValueChange = (value: T, checked: boolean) => {
        setSelectedValues(prev => {
            let newValues: T[];
            if (checked) {
                newValues = [...prev, value];
            } else {
                newValues = prev.filter(v => v !== value);
            }
            onChange?.(newValues);
            return newValues;
        });
    };

    const getButtonText = () => {
        if (selectedValues.length === 0) return placeholder;
        if (selectedValues.length === options.length) return allText;

        const firstValue = options.find(opt => opt.value === selectedValues[0]);
        if (selectedValues.length === 1) return firstValue?.label;

        return (
            <div className="flex items-center gap-2">
                {firstValue?.label}
                <Badge variant="secondary" className="ml-1">+{selectedValues.length - 1}</Badge>
            </div>
        );
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={className}>
                    <span className="truncate">{getButtonText()}</span>
                    <ChevronDown className="ml-2 h-4 w-4 opacity-60 shrink-0" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                {options.map((option) => (
                    <DropdownMenuCheckboxItem
                        key={String(option.value)}
                        checked={selectedValues.includes(option.value)}
                        onCheckedChange={(checked) => handleValueChange(option.value, checked)}
                    >
                        {option.label}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
} 