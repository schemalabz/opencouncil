"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TripleToggleOption<T extends string> {
    value: T;
    label: string;
    icon?: React.ReactNode;
}

interface TripleToggleProps<T extends string> {
    value: T;
    onChange: (value: T) => void;
    options: [TripleToggleOption<T>, TripleToggleOption<T>, TripleToggleOption<T>];
    className?: string;
    disabled?: boolean;
}

export function TripleToggle<T extends string>({
    value,
    onChange,
    options,
    className,
    disabled = false
}: TripleToggleProps<T>) {
    const getColorClasses = (index: number, isActive: boolean) => {
        if (disabled) {
            return "text-gray-400 cursor-not-allowed";
        }
        if (!isActive) {
            return "text-gray-600 hover:text-gray-900 hover:bg-gray-50";
        }

        switch (index) {
            case 0:
                return "bg-gray-900 text-white shadow-sm";
            case 1:
                return "bg-green-600 text-white shadow-sm";
            case 2:
                return "bg-blue-600 text-white shadow-sm";
            default:
                return "bg-gray-900 text-white shadow-sm";
        }
    };

    return (
        <div className={cn("inline-flex rounded-md border border-gray-200 bg-white p-1", disabled && "opacity-50", className)}>
            {options.map((option, index) => (
                <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => !disabled && onChange(option.value)}
                    disabled={disabled}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all",
                        getColorClasses(index, value === option.value)
                    )}
                >
                    {option.icon && <span className="shrink-0">{option.icon}</span>}
                    <span>{option.label}</span>
                </Button>
            ))}
        </div>
    );
}

