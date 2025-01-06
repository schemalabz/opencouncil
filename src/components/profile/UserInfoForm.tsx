"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import type { User } from "@prisma/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface UserInfoFormProps {
    user: User;
    isOnboarded: boolean;
}

export function UserInfoForm({ user, isOnboarded }: UserInfoFormProps) {
    const t = useTranslations("Profile");
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isOpen, setIsOpen] = useState(!isOnboarded);

    const [formData, setFormData] = useState({
        name: user.name || "",
        phone: user.phone || "",
        allowContact: user.allowContact,
    });

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const response = await fetch("/api/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    onboarded: true
                })
            });

            if (!response.ok) throw new Error("Failed to update profile");

            router.refresh();
        } catch (error) {
            console.error("Failed to update profile:", error);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Card>
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <div className="flex items-center justify-between px-6 py-4">
                    <CollapsibleTrigger asChild className="cursor-pointer">
                        <div className="flex items-center justify-between">
                            <CardTitle>
                                {!isOnboarded ? t("welcomeOnboard") : t("personalInfo")}
                            </CardTitle>
                            {!isOnboarded && (
                                <CardDescription>{t("onboardingDescription")}</CardDescription>
                            )}
                            <Button variant="ghost" size="sm">
                                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
                            </Button>
                        </div>
                    </CollapsibleTrigger>
                </div>

                <CollapsibleContent>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="name">{t("fullName")} *</Label>
                                <Input
                                    type="text"
                                    id="name"
                                    required
                                    value={formData.name}
                                    placeholder="Βασίλης Παπαδόπουλος"
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">{t("email")}</Label>
                                <Input
                                    type="email"
                                    id="email"
                                    disabled
                                    value={user.email}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone">{t("phone")}</Label>
                                <PhoneInput
                                    defaultCountry="gr"
                                    value={formData.phone}
                                    onChange={(phone) => setFormData({ ...formData, phone })}
                                    inputClassName="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>

                            <div className="flex items-start space-x-3">
                                <Checkbox
                                    id="allowContact"
                                    checked={formData.allowContact}
                                    onCheckedChange={(checked) =>
                                        setFormData({ ...formData, allowContact: checked as boolean })
                                    }
                                />
                                <div className="space-y-1 leading-none">
                                    <Label htmlFor="allowContact">{t("allowContact")}</Label>
                                    <p className="text-sm text-muted-foreground">
                                        {t("allowContactDescription")}
                                    </p>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={isSubmitting || !formData.name}
                                className="w-full"
                            >
                                {isSubmitting ? t("saving") : t("saveProfile")}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter>
                    </CardFooter>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}
