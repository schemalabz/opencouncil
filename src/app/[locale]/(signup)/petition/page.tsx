import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { MunicipalityPicker } from "@/components/signup/MunicipalityPicker";
import { Eyebrow, SignupLayout, StepHeading } from "@/components/signup/SignupChrome";
import { getCurrentUser } from "@/lib/auth";
import { getAllCitiesMinimalCached } from "@/lib/cache/queries";
import { getPetitionedMapCitiesCached } from "@/lib/db/cities";
import { getUserSignupCityIds } from "@/lib/db/signup";
import { getRealm } from "@/lib/realm.server";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";
import { firstSearchParam } from "@/lib/utils/searchParams";
import { buildOgImageUrl } from "@/lib/og/locale";
import { signupOpenGraph } from "@/lib/og/signupMetadata";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const [{ locale }, t] = await Promise.all([props.params, getTranslations("petition")]);
    const title = t("metaTitle");
    const description = t("metaDescription");
    return {
        title,
        description,
        ...signupOpenGraph(locale, title, description, buildOgImageUrl(locale, { pageType: "petition" })),
        alternates: await buildCanonicalAlternates("/petition"),
    };
}

/**
 * The petition's municipality-agnostic entry: what asking does, then which
 * municipality — found by the search, because a few hundred are too many to
 * scan. A tap lands on step 2 of the petition; a municipality that already
 * has notifications is offered the signup instead. Before any search the
 * list is the municipalities already being asked for, in the landing map's
 * order and with its coarse counts — a few hundred can be asked for, and a
 * list of all of them said nothing. `?q=` is what the reader typed on
 * /notifications before it sent them here, so they do not type it twice.
 * Νότης is not on this page: the petition is not about him.
 */
export default async function PetitionPickerPage(props: { searchParams: Promise<{ q?: string | string[] }> }) {
    const [{ q }, realm, user, t] = await Promise.all([
        props.searchParams,
        getRealm(),
        getCurrentUser(),
        getTranslations("petition"),
    ]);
    const [cities, petitioned, membership] = await Promise.all([
        getAllCitiesMinimalCached(realm),
        getPetitionedMapCitiesCached(realm),
        user ? getUserSignupCityIds(user.id) : { subscribedCityIds: [], petitionedCityIds: [] },
    ]);

    return (
        <SignupLayout className="pb-10">
            <StepHeading eyebrow={t("eyebrow")} title={t("pickerTitle")} lead={t("pickerLead")} className="pt-7 lg:pt-10" />

            <div className="mt-7 flex items-baseline gap-2 lg:mt-9">
                <Eyebrow>{t("pickerEyebrow")}</Eyebrow>
                <span className="text-xs text-muted-foreground">{t("pickerHint")}</span>
            </div>
            <MunicipalityPicker
                cities={cities}
                mode="petition"
                membership={membership}
                petitioned={petitioned.cities.map((city) => ({ id: city.id, bucket: city.bucket }))}
                initialQuery={firstSearchParam(q)}
                className="mt-2.5"
            />

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
