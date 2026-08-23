"use client";
import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { MoreVertical, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { deleteHighlight, renameHighlight } from "@/lib/db/highlights";
import { HIGHLIGHT_NAME_MAX_LENGTH } from "@/lib/highlights/constants";
import { captureHighlight, type HighlightSurface } from "@/lib/highlights/analytics";
import { cn } from "@/lib/utils";
import { openAfterMenuCloses } from "@/lib/utils/menus";

/**
 * Rename and delete for one highlight. Render it only for a viewer who may
 * manage the highlight: the author, or an editor of its city. The server
 * checks the same rule, so this only decides what to offer.
 */
export function HighlightActionsMenu({
    highlightId,
    name,
    surface,
    className,
    onRenamed,
    onDeleted,
}: {
    highlightId: string;
    name: string;
    surface: HighlightSurface;
    className?: string;
    onRenamed?: (name: string) => void;
    onDeleted?: () => void;
}) {
    const t = useTranslations('highlights');
    const router = useRouter();

    const [renaming, setRenaming] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [draftName, setDraftName] = useState(name);
    const [busy, setBusy] = useState(false);

    const openRename = () => {
        setDraftName(name);
        setRenaming(true);
        captureHighlight('rename_opened', surface, { highlight_id: highlightId });
    };

    const submitRename = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmed = draftName.trim();
        if (trimmed.length === 0 || trimmed === name) {
            setRenaming(false);
            return;
        }

        setBusy(true);
        try {
            await renameHighlight(highlightId, trimmed);
            captureHighlight('renamed', surface, { highlight_id: highlightId });
            toast({ title: t('common.success'), description: t('toasts.highlightUpdated') });
            setRenaming(false);
            onRenamed?.(trimmed);
            router.refresh();
        } catch (error) {
            console.error('Failed to rename highlight:', error);
            toast({
                title: t('common.error'),
                description: t('toasts.saveFailedDescription'),
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    };

    const confirmDelete = async () => {
        setBusy(true);
        try {
            await deleteHighlight(highlightId);
            captureHighlight('deleted', surface, { highlight_id: highlightId });
            toast({ title: t('common.success'), description: t('toasts.highlightDeleted') });
            setConfirmingDelete(false);
            onDeleted?.();
            router.refresh();
        } catch (error) {
            console.error('Failed to delete highlight:', error);
            toast({
                title: t('common.error'),
                description: t('toasts.deleteError'),
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            {/* Not modal, and the dialogs open only once it has closed. A modal
                menu and a dialog each lock scrolling and pointer events on
                <body>; overlapping the two leaves a lock behind when the dialog
                closes, and the page then renders but ignores every click. */}
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('actions.menu')}
                        className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", className)}
                    >
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                        onSelect={() => openAfterMenuCloses(openRename)}
                        className="cursor-pointer"
                    >
                        <Pencil className="mr-2 h-4 w-4" />
                        {t('actions.rename')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={() => openAfterMenuCloses(() => setConfirmingDelete(true))}
                        className="cursor-pointer text-red-600 focus:text-red-600"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('details.delete')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={renaming} onOpenChange={open => !busy && setRenaming(open)}>
                <DialogContent className="sm:max-w-md">
                    <form onSubmit={submitRename}>
                        <DialogHeader>
                            <DialogTitle>{t('actions.rename')}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2 py-4">
                            <Label htmlFor={`highlight-name-${highlightId}`}>
                                {t('dialog.highlightName')}
                            </Label>
                            <Input
                                id={`highlight-name-${highlightId}`}
                                value={draftName}
                                onChange={event => setDraftName(event.target.value)}
                                placeholder={t('dialog.namePlaceholder')}
                                maxLength={HIGHLIGHT_NAME_MAX_LENGTH}
                                autoFocus
                                disabled={busy}
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setRenaming(false)}
                                disabled={busy}
                            >
                                {t('dialog.cancel')}
                            </Button>
                            <Button type="submit" disabled={busy || draftName.trim().length === 0}>
                                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('dialog.save')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={confirmingDelete} onOpenChange={open => !busy && setConfirmingDelete(open)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('details.delete')}</DialogTitle>
                        <DialogDescription>{t('confirmations.deleteHighlight')}</DialogDescription>
                    </DialogHeader>
                    {/* The name, so the reader can tell which card the menu belonged to. */}
                    <p className="truncate rounded-md bg-muted px-3 py-2 text-sm font-medium">{name}</p>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setConfirmingDelete(false)}
                            disabled={busy}
                        >
                            {t('dialog.cancel')}
                        </Button>
                        <Button type="button" variant="destructive" onClick={confirmDelete} disabled={busy}>
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('details.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
