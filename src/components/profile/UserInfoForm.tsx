"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import type { User } from "@prisma/client";
import { CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { X, HelpCircle } from "lucide-react";
import { detectCountryFromPhone, isPhoneValid, isPhoneEmpty } from "@/lib/utils/phone";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NotificationPreferencesSection } from "@/components/profile/NotificationPreferencesSection";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { getDateFnsLocale } from "@/lib/formatters/time";

interface UserInfoFormProps {
    user: User;
    isOnboarded: boolean;
}

export function UserInfoForm({ user, isOnboarded }: UserInfoFormProps) {
    const t = useTranslations("Profile");
    const dateLocale = getDateFnsLocale(useLocale());
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState(false);
    const [phoneActive, setPhoneActive] = useState(!isPhoneEmpty(user.phone || ""));
    const [shouldAutoFocus, setShouldAutoFocus] = useState(false);
    const [phoneCountry, setPhoneCountry] = useState(detectCountryFromPhone(user.phone || "") || "GR");

    const [formData, setFormData] = useState({
        name: user.name || "",
        phone: user.phone || "",
        allowProductUpdates: user.allowProductUpdates,
        allowPetitionUpdates: user.allowPetitionUpdates,
    });

    const phoneEmpty = isPhoneEmpty(formData.phone);
    const phoneValid = isPhoneValid(formData.phone, [phoneCountry]);

    async function saveToApi(payload: object) {
        setIsSubmitting(true);
        try {
            const response = await fetch("/api/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error("Failed to update profile");
            router.refresh();
        } catch (error) {
            console.error("Failed to update profile:", error);
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handlePersonalSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (phoneActive && !phoneEmpty && !phoneValid) return;
        await saveToApi({
            name: formData.name,
            phone: phoneEmpty ? null : formData.phone,
            onboarded: true,
        });
    }

    async function handleCommunicationSubmit(e: React.FormEvent) {
        e.preventDefault();
        await saveToApi({
            allowProductUpdates: formData.allowProductUpdates,
            allowPetitionUpdates: formData.allowPetitionUpdates,
        });
    }

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

    const tabTriggerProps = {
        className: "rounded-none rounded-tl-lg py-3 px-4 data-[state=active]:border-t-[#fc550a] data-[state=active]:border-l-[#fc550a] data-[state=active]:border-r-[#fc550a] data-[state=active]:border-b-white data-[state=active]:border-2",
        style: { borderTopLeftRadius: "0.5rem", borderTopRightRadius: "0.5rem", borderBottom: "none" },
    };

    return (
        <Tabs defaultValue="personal" searchParam="tab" local={!isOnboarded}>
            <TabsList className="w-full rounded-none rounded-t-lg border-b h-auto p-0 bg-inherit">
                <TabsTrigger {...tabTriggerProps} value="personal">{t("tabPersonal")}</TabsTrigger>
                <TabsTrigger {...tabTriggerProps} value="communication" disabled={!isOnboarded}>{t("tabCommunication")}</TabsTrigger>
                <TabsTrigger {...tabTriggerProps} value="notifications" disabled={!isOnboarded}>{t("tabNotifications")}</TabsTrigger>
                <TabsTrigger {...tabTriggerProps} value="account" disabled={!isOnboarded}>{t("tabAccount")}</TabsTrigger>
            </TabsList>
            <div className="bg-gradient-to-r from-[#fc550a] via-[#a4c0e1] to-[#fc550a] p-0.5"
                style={{
                    borderBottomLeftRadius: "0.5rem",
                    borderBottomRightRadius: "0.5rem",
                    marginTop: "-0.20rem",
                }}>
                <div className="sm:p-6 p-4 bg-white"
                    style={{
                        borderBottomLeftRadius: "0.5rem",
                        borderBottomRightRadius: "0.5rem",
                    }}>
                    <TabsContent value="personal" className="!mt-0">
                        <div className="space-y-4">
                            <h3 className="font-semibold">{t("tabPersonalHeading")}</h3>
                            {!isOnboarded && (
                                <CardDescription className="mb-6">{t("onboardingDescription")}</CardDescription>
                            )}
                            <form onSubmit={handlePersonalSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="name">{t("fullName")} *</Label>
                                    <Input
                                        type="text"
                                        id="name"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-1.5">
                                        <Label htmlFor="email">{t("email")}</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-pointer" />
                                            </PopoverTrigger>
                                            <PopoverContent className="text-sm">
                                                {t("emailChangeTooltip")}
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <Input
                                        type="email"
                                        id="email"
                                        disabled
                                        value={user.email}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">{t("phone")}</Label>
                                    {phoneActive ? (
                                        <div className="relative">
                                            <PhoneInput
                                                defaultCountry="gr"
                                                value={formData.phone}
                                                onChange={(phone, meta) => {
                                                    setFormData({ ...formData, phone });
                                                    setPhoneCountry(meta.country.iso2);
                                                }}
                                                inputProps={{ autoFocus: shouldAutoFocus }}
                                                inputClassName="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-8"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData({ ...formData, phone: "" });
                                                    setPhoneActive(false);
                                                    setShouldAutoFocus(false);
                                                }}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <Input
                                            type="text"
                                            id="phone"
                                            placeholder={t("phonePlaceholder")}
                                            onFocus={() => {
                                                setPhoneActive(true);
                                                setShouldAutoFocus(true);
                                            }}
                                            readOnly
                                            className="cursor-text"
                                        />
                                    )}
                                    {phoneActive && !phoneEmpty && !phoneValid && (
                                        <p className="text-sm text-destructive">{t("phoneInvalid")}</p>
                                    )}
                                </div>

                                <div className="flex flex-col justify-between gap-2">
                                    <p className="text-xs text-muted-foreground">
                                        {t("lastUpdated", { date: format(new Date(user.updatedAt), 'dd/MM/yyyy HH:mm', { locale: dateLocale }) })}
                                    </p>
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting || !formData.name || (phoneActive && !phoneEmpty && !phoneValid)}
                                        className="whitespace-normal h-auto"
                                    >
                                        {isSubmitting ? t("saving") : t("savePersonalInfo")}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </TabsContent>

                    <TabsContent value="communication" className="mt-0">
                        <div className="space-y-4">
                            <h3 className="font-semibold">{t("tabCommunicationHeading")}</h3>
                            <form onSubmit={handleCommunicationSubmit} className="space-y-6">
                                <div className="flex items-start space-x-3">
                                    <Checkbox
                                        id="allowProductUpdates"
                                        checked={formData.allowProductUpdates}
                                        onCheckedChange={(checked) =>
                                            setFormData({ ...formData, allowProductUpdates: checked as boolean })
                                        }
                                    />
                                    <div className="space-y-1 leading-none">
                                        <Label htmlFor="allowProductUpdates">{t("allowProductUpdates")}</Label>
                                        <p className="text-sm text-muted-foreground">
                                            {t("allowProductUpdatesDescription")}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start space-x-3">
                                    <Checkbox
                                        id="allowPetitionUpdates"
                                        checked={formData.allowPetitionUpdates}
                                        onCheckedChange={(checked) =>
                                            setFormData({ ...formData, allowPetitionUpdates: checked as boolean })
                                        }
                                    />
                                    <div className="space-y-1 leading-none">
                                        <Label htmlFor="allowPetitionUpdates">{t("allowPetitionUpdates")}</Label>
                                        <p className="text-sm text-muted-foreground">
                                            {t("allowPetitionUpdatesDescription")}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs text-muted-foreground">
                                        {t("lastUpdated", { date: format(new Date(user.updatedAt), 'dd/MM/yyyy HH:mm', { locale: dateLocale }) })}
                                    </p>
                                    <div className="flex items-center justify-between">
                                        <Button type="submit" disabled={isSubmitting} className="whitespace-normal h-auto">
                                            {isSubmitting ? t("saving") : t("saveCommunicationPreferences")}
                                        </Button>
                                    </div>
                                </div>
                            </form>
                        </div>

                    </TabsContent>

                    <TabsContent value="notifications" className="mt-0">
                        <NotificationPreferencesSection />
                    </TabsContent>

                    <TabsContent value="account" className="mt-0 space-y-8">
                        <div className="space-y-2">
                            <h3 className="font-semibold">{t("yourData")}</h3>
                            <p className="text-sm text-muted-foreground">
                                {t("yourDataDescription")}{" "}
                                <a href="mailto:dpo@opencouncil.gr" className="underline text-foreground">
                                    dpo@opencouncil.gr
                                </a>
                                .
                            </p>
                        </div>

                        <div className="space-y-2 rounded-lg bg-red-50 p-4">
                            <h3 className="font-semibold text-destructive">{t("dangerZone")}</h3>
                            <p className="text-sm text-muted-foreground">{t("deleteAccountDescription")}</p>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="destructive" className="mt-2">
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
                                            <p className="text-sm text-destructive w-full">{t("deleteAccountError")}</p>
                                        )}
                                        <Button
                                            variant="destructive"
                                            disabled={isDeleting}
                                            onClick={handleDeleteAccount}
                                        >
                                            {isDeleting ? t("deletingAccount") : t("deleteAccountConfirm")}
                                        </Button>
                                        <DialogClose asChild>
                                            <Button variant="outline">
                                                {t("deleteAccountCancel")}
                                            </Button>
                                        </DialogClose>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </TabsContent>
                </div>
            </div>
        </Tabs>
    );
}
