import { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { MunicipalityPicker } from "@/components/signup/MunicipalityPicker";
import { NotisChatCard } from "@/components/signup/NotisChatCard";
import { Eyebrow, SignupLayout, StepHeading } from "@/components/signup/SignupChrome";
import { getCurrentUser } from "@/lib/auth";
import { getAllCitiesMinimalCached } from "@/lib/cache/queries";
import { getUserSignupCityIds } from "@/lib/db/signup";
import { getRealm } from "@/lib/realm.server";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";
import { firstSearchParam } from "@/lib/utils/searchParams";
import { buildOgImageUrl } from "@/lib/og/locale";
import { signupOpenGraph } from "@/lib/og/signupMetadata";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const [{ locale }, t] = await Promise.all([props.params, getTranslations("notificationSignup")]);
    const title = t("pickerMetaTitle");
    const description = t("pickerMetaDescription");
    return {
        title,
        description,
        ...signupOpenGraph(locale, title, description, buildOgImageUrl(locale, { pageType: "notifications" })),
        alternates: await buildCanonicalAlternates("/notifications"),
    };
}

/**
 * The municipality-agnostic entry: what Νότης is, then which municipality.
 * A tap on a municipality lands on step 2 of its signup — the explainer has
 * just been read here. A municipality he does not serve yet is found by the
 * search and offered the petition. Νότης's box sits beside the column on a
 * desktop; on a phone it is in the column, shut, so the list is what the
 * reader meets first.
 *
 * `?q=` is the picker's own search, which it keeps in the URL so Back
 * restores the list. The server renders the same list the URL asks for, so
 * a restored page needs no correction after it hydrates.
 */
export default async function NotificationsPickerPage(props: {
    searchParams: Promise<{ q?: string | string[] }>;
}) {
    const [{ q }, realm, user, t, tc] = await Promise.all([
        props.searchParams,
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
            <StepHeading eyebrow={t("eyebrow")} title={t("pickerTitle")} lead={t("lead")} className="pt-7 lg:pt-10" />

            <NotisChatCard intro={intro} summary={t("pickerPreview")} className="mt-5 lg:hidden" />

            <div className="mt-7 flex items-baseline gap-2 lg:mt-9">
                <Eyebrow>{t("pickerEyebrow")}</Eyebrow>
                <span className="text-xs text-muted-foreground">{t("pickerHint")}</span>
            </div>
            <MunicipalityPicker
                cities={cities}
                mode="notifications"
                membership={membership}
                initialQuery={firstSearchParam(q)}
                className="mt-2.5"
            />

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
