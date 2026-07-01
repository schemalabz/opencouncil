"use client";

import { AdministrativeBodyType } from '@prisma/client';
import { BadgePicker } from './badge-picker';
import { Label } from './label';
import { cn } from '@/lib/utils';

/** A single administrative body (an instance of a type). `value` is the body id. */
export interface AdminBodyOption {
    value: string;
    label: string;
}

/** An administrative body type together with its individual bodies. */
export interface AdminBodyGroup {
    type: AdministrativeBodyType;
    typeLabel: string;
    bodies: AdminBodyOption[];
}

interface AdminBodyPickerProps {
    /** Types (level 1) and their bodies (level 2). */
    groups: AdminBodyGroup[];
    /** Selected type, or null for "all types". */
    selectedType: AdministrativeBodyType | null;
    onTypeChange: (type: AdministrativeBodyType | null) => void;
    /** Selected specific body id within the selected type, or null for "all bodies". */
    selectedBodyId: string | null;
    onBodyChange: (bodyId: string | null) => void;
    allTypesLabel: string;
    allBodiesLabel: string;
    /** Optional field label rendered above the picker (only when the picker is shown). */
    label?: string;
    className?: string;
}

/**
 * Two-level administrative body filter: pick a type, then — when that type has
 * more than one body — pick a specific body. Both levels are single-select.
 * Presentational and controlled: the caller supplies the groups and selection
 * and decides how to persist them (URL params, embed-url state, …). Shared by
 * the city meetings list and the embed widget configurator.
 *
 * Renders nothing when there's no real choice (a single type with a single body).
 */
export function AdminBodyPicker({
    groups,
    selectedType,
    onTypeChange,
    selectedBodyId,
    onBodyChange,
    allTypesLabel,
    allBodiesLabel,
    label,
    className,
}: AdminBodyPickerProps) {
    // A choice exists if there's more than one type, or a single type with >1 body.
    const hasChoice = groups.length > 1 || groups.some(g => g.bodies.length > 1);
    if (!hasChoice) return null;

    const typeOptions = groups.map(g => ({ value: g.type, label: g.typeLabel }));
    const selectedGroup = selectedType ? groups.find(g => g.type === selectedType) ?? null : null;
    const showInstancePicker = !!selectedGroup && selectedGroup.bodies.length > 1;

    return (
        <div className={cn('space-y-2', className)}>
            {label && <Label>{label}</Label>}
            <BadgePicker
                options={typeOptions}
                selectedValues={selectedType ? [selectedType] : []}
                onSelectionChange={values => onTypeChange(values[0] ?? null)}
                allLabel={allTypesLabel}
                collapsible={false}
                inline
            />
            {showInstancePicker && selectedGroup && (
                <BadgePicker
                    options={selectedGroup.bodies}
                    selectedValues={selectedBodyId ? [selectedBodyId] : []}
                    onSelectionChange={values => onBodyChange(values[0] ?? null)}
                    allLabel={allBodiesLabel}
                    collapsible={false}
                    inline
                />
            )}
        </div>
    );
}
