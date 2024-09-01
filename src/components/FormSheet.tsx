import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet"
import { Button } from "./ui/button"
import React, { useState } from "react";
interface FormSheetProps<T> {
    FormComponent: React.ComponentType<T & { onSuccess: () => void }>;
    formProps: T;
    title: string;
}

export default function FormSheet<T>({ FormComponent, formProps, title }: FormSheetProps<T>) {
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
                <Button className="">{title}</Button>
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
