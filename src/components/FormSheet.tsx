import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet"
import { Button, type ButtonProps } from "./ui/button"
import React, { useState } from "react";
import { Plus, Pencil } from 'lucide-react';
interface FormSheetProps<T> {
    FormComponent: React.ComponentType<T & { onSuccess: () => void }>;
    formProps: T;
    title: string;
    type: "add" | "edit";
    closeOnSuccess?: boolean;
    /** Restyle the trigger to sit alongside other controls (e.g. a quiet admin row). */
    triggerVariant?: ButtonProps["variant"];
    triggerSize?: ButtonProps["size"];
    triggerClassName?: string;
}

export default function FormSheet<T>({
    FormComponent,
    formProps,
    title,
    type,
    closeOnSuccess = false,
    triggerVariant = "outline",
    triggerSize,
    triggerClassName,
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
            <SheetContent className="overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>{title}</SheetTitle>
                </SheetHeader>
                <FormComponent {...formProps} onSuccess={handleSuccess} />
            </SheetContent>
        </Sheet>
    );
}
