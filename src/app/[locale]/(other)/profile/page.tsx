import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { UserInfoForm } from "@/components/profile/UserInfoForm";
import { AdminSection } from "@/components/profile/AdminSection";
import { DevelopmentSection } from "@/components/profile/DevelopmentSection";
import { NotificationPreferencesSection } from "@/components/profile/NotificationPreferencesSection";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
    const user = await getCurrentUser();
    if (!user) redirect("/sign-in");

    const t = await getTranslations("Profile");

    const isAdmin = user.isSuperAdmin || user.administers.length > 0;

    return (
        <div className="container max-w-2xl py-8 space-y-8">
            <DevelopmentSection />
            <UserInfoForm user={user} isOnboarded={!!user.onboarded} />
            <NotificationPreferencesSection />
            {user.onboarded && isAdmin && <AdminSection user={user} t={t} />}
        </div>
    );
}
