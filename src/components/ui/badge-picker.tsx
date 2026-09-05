"use client";

import { Button } from './button';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Filter } from 'lucide-react';
import Icon from '@/components/icon';
import { topicStyle } from '@/lib/topicStyle';

export interface BadgePickerOption<T extends string> {
    value: T;
    label: string;
    color?: string;
    /** A lucide glyph for the option (topics have one); options without keep the plain dot. */
    icon?: string | null;
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
    const t = useTranslations('Common');

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
                    aria-expanded={expanded}
                    aria-label={t('filter', { label: selectedLabel })}
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
    // Explicit radii: the theme sets --radius to 0, so `rounded-md` renders square
    // chips beside cards that are rounded-2xl.
    const badgeClass = inline
        ? "h-8 px-3 rounded-full text-xs"
        : "h-7 px-2.5 rounded-full text-xs";

    return (
        <div className="flex flex-wrap gap-1.5">
            <Button
                variant={isAllSelected ? "default" : "ghost"}
                size="sm"
                className={cn(
                    badgeClass,
                    isAllSelected
                        ? "bg-foreground text-background hover:bg-foreground"
                        : "text-muted-foreground hover:!bg-foreground/[0.06] hover:text-foreground"
                )}
                onClick={onSelectAll}
                aria-pressed={isAllSelected}
            >
                {allLabel}
            </Button>
            {options.map((option) => {
                const isSelected = selectedValues.includes(option.value);
                return (
                    <Button
                        key={option.value}
                        variant={isSelected ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                            badgeClass,
                            "flex items-center gap-1.5",
                            isSelected
                                ? "bg-foreground text-background hover:bg-foreground"
                                : "text-muted-foreground hover:!bg-foreground/[0.06] hover:text-foreground"
                        )}
                        onClick={() => onToggle(option.value)}
                        aria-pressed={isSelected}
                        style={
                            option.color
                                ? isSelected
                                    ? { backgroundColor: option.color, borderColor: option.color, color: topicStyle(option.color, 'solid').icon }
                                    : { borderColor: `${option.color}40` }
                                : undefined
                        }
                    >
                        {option.icon ? (
                            // The topic's own glyph, inked the way every TopicIcon inks it —
                            // the raw hex is too light for a 14px stroke on white.
                            <Icon
                                name={option.icon}
                                size={14}
                                color={isSelected ? topicStyle(option.color, 'solid').icon : topicStyle(option.color).icon}
                            />
                        ) : option.color && (
                            <div
                                className="w-1.5 h-1.5 rounded-full"
                                aria-hidden="true"
                                style={{
                                    backgroundColor: isSelected ? topicStyle(option.color, 'solid').icon : option.color
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
