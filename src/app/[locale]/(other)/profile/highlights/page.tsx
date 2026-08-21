import { getLocale, getTranslations } from "next-intl/server";
// The locale-aware redirect: next/navigation's would send a bare "/sign-in",
// dropping the locale prefix and landing the user on the Greek page.
import { redirect } from "@/i18n/routing";
import { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getMyHighlights } from "@/lib/db/highlights";
import { MyHighlights } from "@/components/highlights/MyHighlights";

// Personalized page behind sign-in — nothing to index.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export default async function MyHighlightsPage() {
    const user = await getCurrentUser();
    if (!user) redirect({ href: "/sign-in?callbackUrl=/profile/highlights", locale: await getLocale() });

    const [{ highlights, truncated }, t] = await Promise.all([
        getMyHighlights(),
        getTranslations("highlights.myHighlights"),
    ]);

    return (
        <div className="container max-w-4xl py-8 space-y-8 !px-3 sm:!px-8">
            <div>
                <h1 className="text-3xl font-bold">{t("title")}</h1>
                <p className="text-muted-foreground mt-2">{t("description")}</p>
            </div>
            <MyHighlights highlights={highlights} truncated={truncated} />
        </div>
    );
}
