import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet"
import { Button, type ButtonProps } from "./ui/button"
import React, { useState } from "react";
import { Plus, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
interface FormSheetProps<T> {
    FormComponent: React.ComponentType<T & { onSuccess: () => void }>;
    formProps: T;
    title: string;
    /** What is being edited — the sheet's title alone rarely says. */
    description?: string;
    type: "add" | "edit";
    closeOnSuccess?: boolean;
    /** Restyle the trigger to sit alongside other controls (e.g. a quiet admin row). */
    triggerVariant?: ButtonProps["variant"];
    triggerSize?: ButtonProps["size"];
    triggerClassName?: string;
    /** Widen the sheet for forms that a 384px column cannot hold (maps, nested lists). */
    contentClassName?: string;
}

export default function FormSheet<T>({
    FormComponent,
    formProps,
    title,
    description,
    type,
    closeOnSuccess = false,
    triggerVariant = "outline",
    triggerSize,
    triggerClassName,
    contentClassName,
}: FormSheetProps<T>) {
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    const handleSuccess = () => {
        if (closeOnSuccess) {
            setIsSheetOpen(false);
        }
        if ((formProps as any).onSuccess) {
            (formProps as any).onSuccess();
        }
    };

    return (
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
                <Button variant={triggerVariant} size={triggerSize} className={triggerClassName}>
                    <span className="hidden md:inline">{title}</span>
                    <span className="md:hidden">
                        {type === "add" ? <Plus size={24} /> : <Pencil size={24} />}
                    </span>
                </Button>
            </SheetTrigger>
            <SheetContent className={cn("overflow-y-auto", contentClassName)}>
                {/* Left-aligned and ruled off: the default centres the title, which
                    reads as a dialog announcement rather than as the head of a form.
                    pr-8 keeps it clear of the sheet's own close control. */}
                <SheetHeader className="mb-5 space-y-1 border-b border-border pb-4 pr-8 text-left">
                    <SheetTitle className="text-base">{title}</SheetTitle>
                    {description && <SheetDescription className="text-xs">{description}</SheetDescription>}
                </SheetHeader>
                <FormComponent {...formProps} onSuccess={handleSuccess} />
            </SheetContent>
        </Sheet>
    );
}
