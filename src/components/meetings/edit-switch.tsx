"use client";
import { Edit, Eye } from "lucide-react";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { useTranscriptOptions } from "./options/OptionsContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useId } from "react";

export default function EditSwitch({ }: {}) {
    const { options, updateOptions } = useTranscriptOptions();
    const id = useId();

    return (
        options.editsAllowed && (
            <div className="relative inline-grid h-9 grid-cols-[1fr_1fr] items-center text-sm font-medium">
                <Switch
                    id={id}
                    checked={options.editable}
                    onCheckedChange={(checked) => updateOptions({ editable: checked })}
                    className="peer absolute inset-0 h-[inherit] w-auto data-[state=unchecked]:bg-input/50 [&_span]:z-10 [&_span]:h-full [&_span]:w-1/2 [&_span]:transition-transform [&_span]:duration-300 [&_span]:[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] data-[state=checked]:[&_span]:translate-x-full rtl:data-[state=checked]:[&_span]:-translate-x-full"
                />
                <span className="pointer-events-none relative ms-0.5 flex min-w-8 items-center justify-center text-center transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] peer-data-[state=checked]:invisible peer-data-[state=unchecked]:translate-x-full rtl:peer-data-[state=unchecked]:-translate-x-full">
                    <Eye size={16} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="pointer-events-none relative me-0.5 flex min-w-8 items-center justify-center text-center transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] peer-data-[state=unchecked]:invisible peer-data-[state=checked]:-translate-x-full peer-data-[state=checked]:text-background rtl:peer-data-[state=checked]:translate-x-full">
                    <Edit size={16} strokeWidth={2} aria-hidden="true" />
                </span>
                <Label htmlFor={id} className="sr-only">
                    Toggle edit mode
                </Label>
            </div>
        )
    );
}