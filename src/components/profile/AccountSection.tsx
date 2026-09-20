"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DPO_EMAIL } from "@/lib/dpo";
import { FieldError, SettingsBody, SettingsCard } from "@/components/profile/SettingsChrome";

/**
 * The account itself: the right to a copy of the data, the way out of this
 * device, and the way out for good. The delete confirms in a dialog and
 * signs the reader out once the server has agreed.
 */
export function AccountSection() {
    const t = useTranslations("Profile");
    const tAccount = useTranslations("account");
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState(false);
    const [signingOut, setSigningOut] = useState(false);

    async function handleDeleteAccount() {
        setIsDeleting(true);
        setDeleteError(false);
        try {
            const response = await fetch("/api/profile", { method: "DELETE" });
            if (!response.ok) throw new Error("Failed to delete account");
            await signOut({ callbackUrl: "/" });
        } catch (error) {
            console.error("Failed to delete account:", error);
            setDeleteError(true);
        } finally {
            setIsDeleting(false);
        }
    }

    async function handleSignOut() {
        setSigningOut(true);
        await signOut({ callbackUrl: "/" });
    }

    return (
        <div className="flex flex-col gap-4">
            <SettingsCard title={t("yourData")}>
                <SettingsBody className="pt-1">
                    <p className="text-[14px] leading-[1.5] text-muted-foreground">
                        {t("yourDataDescription")}{" "}
                        <a href={`mailto:${DPO_EMAIL}`} className="underline underline-offset-2 text-foreground">
                            {DPO_EMAIL}
                        </a>
                        .
                    </p>
                </SettingsBody>
            </SettingsCard>

            <SettingsCard
                title={tAccount("signOut")}
                description={t("signOutDescription")}
                action={
                    <Button variant="outline" size="sm" disabled={signingOut} onClick={handleSignOut} className="gap-1.5">
                        <LogOut className="h-4 w-4" aria-hidden />
                        {tAccount("signOut")}
                    </Button>
                }
            />

            <SettingsCard tone="danger" title={t("dangerZone")} description={t("deleteAccountDescription")}>
                <SettingsBody className="pt-3">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                                {t("deleteAccount")}
                            </Button>
                        </DialogTrigger>
                        <DialogContent align="start">
                            <DialogHeader>
                                <DialogTitle>{t("deleteAccountConfirmTitle")}</DialogTitle>
                                <DialogDescription>{t("deleteAccountConfirmDescription")}</DialogDescription>
                            </DialogHeader>
                            <DialogFooter className="gap-3">
                                {deleteError && (
                                    <div className="w-full">
                                        <FieldError>{t("deleteAccountError")}</FieldError>
                                    </div>
                                )}
                                <Button variant="destructive" disabled={isDeleting} onClick={handleDeleteAccount}>
                                    {isDeleting ? t("deletingAccount") : t("deleteAccountConfirm")}
                                </Button>
                                <DialogClose asChild>
                                    <Button variant="outline">{t("deleteAccountCancel")}</Button>
                                </DialogClose>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </SettingsBody>
            </SettingsCard>
        </div>
    );
}
