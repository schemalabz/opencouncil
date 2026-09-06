import { Metadata } from "next";
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
    const t = await getTranslations("petition");
    return {
        title: t("metaTitle"),
        description: t("metaDescription"),
        alternates: await buildCanonicalAlternates("/petition"),
    };
}

/**
 * The petition's municipality-agnostic entry: what asking does, then which
 * municipality — found by the search, because a few hundred are too many to
 * scan. A tap lands on step 2 of the petition; a municipality that already
 * has notifications is offered the signup instead.
 */
export default async function PetitionPickerPage() {
    const [realm, user, t] = await Promise.all([getRealm(), getCurrentUser(), getTranslations("petition")]);
    const [cities, membership] = await Promise.all([
        getAllCitiesMinimalCached(realm),
        user ? getUserSignupCityIds(user.id) : { subscribedCityIds: [], petitionedCityIds: [] },
    ]);

    return (
        <SignupLayout aside={<NotisChatCard intro={t("whatYouGet")} />} className="pb-10">
            <div className="flex flex-col gap-3 pt-7 lg:pt-10">
                <Eyebrow>{t("eyebrow")}</Eyebrow>
                <h1 className="text-[30px] font-normal leading-none tracking-[-0.02em] lg:text-[36px]">{t("pickerTitle")}</h1>
                <p className="text-[15px] leading-[1.45] text-muted-foreground lg:text-base">{t("pickerLead")}</p>
            </div>

            <NotisChatCard intro={t("whatYouGet")} className="mt-5 lg:hidden" />

            <div className="mt-7 flex items-baseline gap-2 lg:mt-9">
                <Eyebrow>{t("pickerEyebrow")}</Eyebrow>
                <span className="text-xs text-muted-foreground">{t("pickerHint")}</span>
            </div>
            <MunicipalityPicker cities={cities} mode="petition" membership={membership} className="mt-2.5" />

            <p className="mt-4 text-[11px] leading-[1.4] text-muted-foreground">
                {t.rich("pricingNote", {
                    link: (chunks) => (
                        <Link href="/about" className="underline">
                            {chunks}
                        </Link>
                    ),
                })}
            </p>
        </SignupLayout>
    );
}
