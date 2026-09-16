import { getTranslations } from "next-intl/server";
// The locale-aware Link: next/link would emit a bare "/profile/highlights",
// dropping the locale prefix and landing the user on the Greek page.
import { Link } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth";
import { canAccessMyHighlights } from "@/lib/db/highlights";
import { UserInfoForm } from "@/components/profile/UserInfoForm";
import { AdminSection } from "@/components/profile/AdminSection";
import { DevelopmentSection } from "@/components/profile/DevelopmentSection";
import { Clapperboard, ChevronRight } from "lucide-react";
import { ClaimNotice } from "@/components/profile/ClaimNotice";
import { claimMessageKey } from "@/lib/utils/claimStatus";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { env } from "@/env.mjs";

// Personalized page behind sign-in — nothing to index.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export default async function ProfilePage(props: { searchParams: Promise<{ claim?: string }> }) {
    const [user, { claim }] = await Promise.all([getCurrentUser(), props.searchParams]);
    if (!user) redirect("/sign-in");
    // A success needs the link to exist: the status is a query parameter,
    // and anyone can type one.
    const claimKey = claimMessageKey(claim);
    const hasPerson = user.administers.some((a) => a.person);
    const claimShown = claimKey === "linked" || claimKey === "alreadyYours" ? hasPerson : claimKey !== null;

    const [t, tAccount, highlightsAllowed] = await Promise.all([
        getTranslations("Profile"),
        getTranslations("account"),
        canAccessMyHighlights(),
    ]);

    return (
        <div className="container max-w-2xl py-8 space-y-8 !px-3 sm:!px-8">
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            {claimKey && claimShown && (
                <ClaimNotice
                    variant={claimKey === "linked" || claimKey === "alreadyYours" ? "default" : "destructive"}
                    title={t("claim.title")}
                    description={
                        claimKey === "linked"
                            ? user.onboarded ? t("claim.linked") : t("claim.linkedOnboarding")
                            : claimKey === "alreadyYours" ? t("claim.alreadyYours")
                            : claimKey === "alreadyLinked" ? t("claim.alreadyLinked")
                            : claimKey === "notFound" ? t("claim.notFound")
                            : t("claim.invalid")
                    }
                />
            )}
            <DevelopmentSection isPreview={env.DEPLOYMENT_ENV === 'preview'} />
            {user.onboarded && (user.isSuperAdmin || user.administers.length > 0) && <AdminSection user={user} t={t} />}
            {user.onboarded && highlightsAllowed && (
                <Link
                    href="/profile/highlights"
                    className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm no-underline transition-colors hover:bg-muted hover:no-underline"
                >
                    <Clapperboard className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium text-foreground">{tAccount("myHighlights")}</span>
                    <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
            )}
            <UserInfoForm user={user} isOnboarded={!!user.onboarded} />
        </div>
    );
}
