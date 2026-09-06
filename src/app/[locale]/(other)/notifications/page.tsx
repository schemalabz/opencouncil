import { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { MunicipalityPicker } from "@/components/signup/MunicipalityPicker";
import { NotisChatCard } from "@/components/signup/NotisChatCard";
import { Eyebrow, SignupLayout } from "@/components/signup/SignupChrome";
import { getCurrentUser } from "@/lib/auth";
import { getAllCitiesMinimalCached } from "@/lib/cache/queries";
import { getUserSignupCityIds } from "@/lib/db/signup";
import { getRealm } from "@/lib/realm.server";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("notificationSignup");
    return {
        title: t("pickerMetaTitle"),
        description: t("pickerMetaDescription"),
        alternates: await buildCanonicalAlternates("/notifications"),
    };
}

/**
 * The municipality-agnostic entry: what Νότης is, then which municipality.
 * A tap on a municipality lands on step 2 of its signup — the explainer has
 * just been read here. A municipality he does not serve yet is found by the
 * search and offered the petition. Νότης's box sits in the column on a
 * phone and beside it on a desktop.
 */
export default async function NotificationsPickerPage() {
    const [realm, user, t, tc] = await Promise.all([
        getRealm(),
        getCurrentUser(),
        getTranslations("notificationSignup"),
        getTranslations("cityOverview"),
    ]);
    const [cities, membership] = await Promise.all([
        getAllCitiesMinimalCached(realm),
        user ? getUserSignupCityIds(user.id) : { subscribedCityIds: [], petitionedCityIds: [] },
    ]);
    const intro = tc("notisIntro.municipality");

    return (
        <SignupLayout aside={<NotisChatCard intro={intro} />} className="pb-10">
            <div className="flex flex-col gap-3 pt-7 lg:pt-10">
                <Eyebrow>{t("eyebrow")}</Eyebrow>
                <h1 className="text-[30px] font-normal leading-none tracking-[-0.02em] lg:text-[36px]">{t("pickerTitle")}</h1>
                <p className="text-[15px] leading-[1.45] text-muted-foreground lg:text-base">{t("lead")}</p>
            </div>

            <NotisChatCard intro={intro} className="mt-5 lg:hidden" />

            <div className="mt-7 flex items-baseline gap-2 lg:mt-9">
                <Eyebrow>{t("pickerEyebrow")}</Eyebrow>
                <span className="text-xs text-muted-foreground">{t("pickerHint")}</span>
            </div>
            <MunicipalityPicker cities={cities} mode="notifications" membership={membership} className="mt-2.5" />

            <div className="mt-4 flex flex-col gap-0.5">
                <span className="text-sm text-muted-foreground">{t("noCityTitle")}</span>
                <Link
                    href="/petition"
                    className="group/cta inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-[hsl(var(--orange-deep))] hover:no-underline"
                >
                    {t("noCityCta")}
                    <ArrowRight className="h-[15px] w-[15px] transition-transform group-hover/cta:translate-x-0.5" aria-hidden />
                </Link>
            </div>

            <p className="mt-4 text-[11px] leading-[1.4] text-muted-foreground">{t("pickerFootnote")}</p>
        </SignupLayout>
    );
}
