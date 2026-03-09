import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getHighlightsForUser } from "@/lib/db/highlights";
import { getTranslations } from "next-intl/server";
import { UserHighlightsList } from "@/components/profile/UserHighlightsList";

export default async function UserHighlightsPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/sign-in");

    const highlights = await getHighlightsForUser(user.id);
    const t = await getTranslations("Profile");

    return (
        <div className="container max-w-4xl py-8 space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{t("highlights.title")}</h1>
                <p className="text-muted-foreground mt-1">
                    {t("highlights.description")}
                </p>
            </div>
            <UserHighlightsList highlights={highlights} />
        </div>
    );
}
