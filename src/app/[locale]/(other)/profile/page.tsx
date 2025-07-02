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
        <div className="container max-w-2xl py-8 space-y-8">
            <DevelopmentSection />
            {user.onboarded && user.name && <AdminSection user={user} t={t} />}
            <UserInfoForm user={user} isOnboarded={!!user.onboarded} />
        </div>
    );
}
