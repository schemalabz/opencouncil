"use client";

import { Input } from "@/components/ui/input";
import { ExternalLink } from "lucide-react";
import Icon, { ICON_NAMES } from "@/components/icon";

const validIconSet = new Set(ICON_NAMES);

interface IconInputProps {
    value: string;
    onChange: (value: string) => void;
    color?: string;
    placeholder?: string;
}

export function isValidIconName(name: string): boolean {
    return validIconSet.has(name);
}

export function IconInput({ value, onChange, color = "#6b7280", placeholder = "e.g. heart, building" }: IconInputProps) {
    const isValid = validIconSet.has(value);

    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-2">
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1"
                />
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border">
                    {value && isValid ? (
                        <Icon name={value} color={color} size={18} />
                    ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                    )}
                </div>
            </div>
            {value && !isValid && (
                <p className="text-xs text-destructive">Unknown icon name</p>
            )}
            <p className="text-xs text-muted-foreground">
                Browse icons at{" "}
                <a
                    href="https://lucide.dev/icons"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline hover:text-foreground"
                >
                    lucide.dev/icons
                    <ExternalLink className="h-3 w-3" />
                </a>
                {" "}and paste the name here.
            </p>
        </div>
    );
}
