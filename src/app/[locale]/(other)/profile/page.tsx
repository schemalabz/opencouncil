import { getTranslations } from "next-intl/server";
// The locale-aware Link: next/link would emit a bare "/profile/highlights",
// dropping the locale prefix and landing the user on the Greek page.
import { Link } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth";
import { UserInfoForm } from "@/components/profile/UserInfoForm";
import { AdminSection } from "@/components/profile/AdminSection";
import { DevelopmentSection } from "@/components/profile/DevelopmentSection";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { env } from "@/env.mjs";

// Personalized page behind sign-in — nothing to index.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export default async function ProfilePage() {
    const user = await getCurrentUser();
    if (!user) redirect("/sign-in");

    const [t, tAccount] = await Promise.all([
        getTranslations("Profile"),
        getTranslations("account"),
    ]);

    return (
        <div className="container max-w-2xl py-8 space-y-8 !px-3 sm:!px-8">
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <DevelopmentSection isPreview={env.DEPLOYMENT_ENV === 'preview'} />
            {user.onboarded && (user.isSuperAdmin || user.administers.length > 0) && <AdminSection user={user} t={t} />}
            {user.onboarded && <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Star className="h-5 w-5" />
                        {tAccount("myHighlights")}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{t("myHighlightsDescription")}</p>
                    <Button asChild>
                        <Link href="/profile/highlights">{t("viewMyHighlights")}</Link>
                    </Button>
                </CardContent>
            </Card>}
            <UserInfoForm user={user} isOnboarded={!!user.onboarded} />
        </div>
    );
}
