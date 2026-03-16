"use client";

import { Button } from './button';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { ChevronDown, Filter } from 'lucide-react';

export interface BadgePickerOption<T extends string> {
    value: T;
    label: string;
    color?: string;
}

interface BadgePickerProps<T extends string> {
    options: BadgePickerOption<T>[];
    selectedValues: T[];
    onSelectionChange: (values: T[]) => void;
    allLabel: string;
    className?: string;
    collapsible?: boolean;
    /** When true, uses h-9 rounded-md to match adjacent form inputs */
    inline?: boolean;
}

export function BadgePicker<T extends string>({
    options,
    selectedValues,
    onSelectionChange,
    allLabel,
    className,
    collapsible = true,
    inline = false
}: BadgePickerProps<T>) {
    const [expanded, setExpanded] = useState(false);

    if (options.length === 0) {
        return null;
    }

    const isAllSelected = selectedValues.length === 0;
    const selectedLabel = isAllSelected
        ? allLabel
        : options.filter(o => selectedValues.includes(o.value)).map(o => o.label).join(', ');

    const handleToggle = (value: T) => {
        // Clicking the already-selected value deselects it (back to all)
        if (selectedValues.includes(value)) {
            onSelectionChange([]);
        } else {
            onSelectionChange([value]);
        }
    };

    const handleSelectAll = () => {
        onSelectionChange([]);
    };

    return (
        <motion.div
            className={cn("flex flex-col", className)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            {/* Mobile: collapsed toggle */}
            {collapsible && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="sm:hidden flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <Filter className="w-3.5 h-3.5" />
                    <span>{selectedLabel}</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
                </button>
            )}

            {/* Mobile: expandable list */}
            {collapsible && (
                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="sm:hidden overflow-hidden mt-2"
                        >
                            <BadgeButtons
                                options={options}
                                selectedValues={selectedValues}
                                onToggle={(value) => {
                                    handleToggle(value);
                                }}
                                onSelectAll={() => {
                                    handleSelectAll();
                                    setExpanded(false);
                                }}
                                allLabel={allLabel}
                                inline={inline}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            )}

            {/* Mobile non-collapsible: always visible */}
            {!collapsible && (
                <div className="sm:hidden">
                    <BadgeButtons
                        options={options}
                        selectedValues={selectedValues}
                        onToggle={handleToggle}
                        onSelectAll={handleSelectAll}
                        allLabel={allLabel}
                        inline={inline}
                    />
                </div>
            )}

            {/* Desktop: always visible */}
            <div className="hidden sm:block">
                <BadgeButtons
                    options={options}
                    selectedValues={selectedValues}
                    onToggle={handleToggle}
                    onSelectAll={handleSelectAll}
                    allLabel={allLabel}
                    inline={inline}
                />
            </div>
        </motion.div>
    );
}

function BadgeButtons<T extends string>({
    options,
    selectedValues,
    onToggle,
    onSelectAll,
    allLabel,
    inline
}: {
    options: BadgePickerOption<T>[];
    selectedValues: T[];
    onToggle: (value: T) => void;
    onSelectAll: () => void;
    allLabel: string;
    inline: boolean;
}) {
    const isAllSelected = selectedValues.length === 0;
    const badgeClass = inline
        ? "h-9 px-3 rounded-md shadow-sm text-xs"
        : "h-7 px-2.5 rounded-full shadow-sm text-xs";

    return (
        <div className="flex flex-wrap gap-1.5">
            <Button
                variant={isAllSelected ? "default" : "outline"}
                size="sm"
                className={cn(
                    badgeClass,
                    isAllSelected ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted/50"
                )}
                onClick={onSelectAll}
            >
                {allLabel}
            </Button>
            {options.map((option) => {
                const isSelected = selectedValues.includes(option.value);
                return (
                    <Button
                        key={option.value}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className={cn(
                            badgeClass,
                            "flex items-center gap-1.5",
                            isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-background hover:bg-muted/50"
                        )}
                        onClick={() => onToggle(option.value)}
                        style={
                            option.color
                                ? isSelected
                                    ? { backgroundColor: option.color, borderColor: option.color, color: '#fff' }
                                    : { borderColor: `${option.color}40` }
                                : undefined
                        }
                    >
                        {option.color && (
                            <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                    backgroundColor: isSelected ? '#fff' : option.color
                                }}
                            />
                        )}
                        {option.label}
                    </Button>
                );
            })}
        </div>
    );
}
