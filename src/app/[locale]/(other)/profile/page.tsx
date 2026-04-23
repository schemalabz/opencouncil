import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { UserInfoForm } from "@/components/profile/UserInfoForm";
import { AdminSection } from "@/components/profile/AdminSection";
import { DevelopmentSection } from "@/components/profile/DevelopmentSection";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
    const user = await getCurrentUser();
    if (!user) redirect("/sign-in");

    const t = await getTranslations("Profile");

    return (
        <div className="container max-w-2xl py-8 space-y-8 !px-3 sm:!px-8">
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <DevelopmentSection />
            {user.onboarded && (user.isSuperAdmin || user.administers.length > 0) && <AdminSection user={user} t={t} />}
            <UserInfoForm user={user} isOnboarded={!!user.onboarded} />
        </div>
    );
}
