"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDeleteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The heading, and the label of the destructive button. */
    title: string;
    description: string;
    /** The name of what is deleted, so the reader can check it is the right one. */
    itemName: string;
    onConfirm: () => Promise<void>;
}

export function ConfirmDeleteDialog({
    open,
    onOpenChange,
    title,
    description,
    itemName,
    onConfirm,
}: ConfirmDeleteDialogProps) {
    const t = useTranslations("Common");
    const [busy, setBusy] = useState(false);

    const confirm = async () => {
        setBusy(true);
        try {
            await onConfirm();
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <p className="truncate rounded-md bg-muted px-3 py-2 text-sm font-medium">{itemName}</p>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        {t("cancel")}
                    </Button>
                    <Button type="button" variant="destructive" onClick={confirm} disabled={busy}>
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {title}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
