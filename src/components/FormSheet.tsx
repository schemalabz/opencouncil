import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet"
import { Button } from "./ui/button"
import React, { useState } from "react";
import { Plus, Pencil } from 'lucide-react';
interface FormSheetProps<T> {
    FormComponent: React.ComponentType<T & { onSuccess: () => void }>;
    formProps: T;
    title: string;
    type: "add" | "edit";
}

export default function FormSheet<T>({ FormComponent, formProps, title, type }: FormSheetProps<T>) {
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    const handleSuccess = () => {
        setIsSheetOpen(false);
        if ((formProps as any).onSuccess) {
            (formProps as any).onSuccess();
        }
    };


    return (
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
                <Button className="" variant="outline">
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
