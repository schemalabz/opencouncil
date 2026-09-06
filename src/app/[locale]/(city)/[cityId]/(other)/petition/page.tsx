import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PetitionSignup } from "@/components/petition/PetitionSignup";
import { getCurrentUser } from "@/lib/auth";
import { getCityPetitionBucketCached } from "@/lib/cache/queries";
import { getCity } from "@/lib/db/cities";
import { getUserPetition } from "@/lib/db/signup";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";

export async function generateMetadata(props: { params: Promise<{ cityId: string }> }): Promise<Metadata> {
    const { cityId } = await props.params;
    const t = await getTranslations("petition");
    return {
        title: t("metaTitle"),
        description: t("metaDescription"),
        alternates: await buildCanonicalAlternates(`/${cityId}/petition`),
    };
}

interface PageProps {
    params: Promise<{ cityId: string }>;
    searchParams: Promise<{ step?: string }>;
}

/**
 * The petition for one municipality OpenCouncil does not cover yet: step 1
 * explains, step 2 asks who is asking. `?step=2` is where the municipality
 * picker on /petition lands. A municipality that already has notifications
 * has nothing to ask for; its readers go to the signup.
 */
export default async function PetitionSignupPage(props: PageProps) {
    const [{ cityId }, { step }] = await Promise.all([props.params, props.searchParams]);
    const [city, user] = await Promise.all([getCity(cityId, { includeGeometry: true }), getCurrentUser()]);

    if (!city) {
        notFound();
    }
    if (city.supportsNotifications) {
        redirect(`/${cityId}/notifications`);
    }

    const [bucket, petition] = await Promise.all([
        getCityPetitionBucketCached(city.id),
        user ? getUserPetition(user.id, city.id) : null,
    ]);

    return (
        <PetitionSignup
            city={city}
            bucket={bucket}
            initialStep={step === "2" ? 2 : 1}
            existing={petition ? { isResident: petition.is_resident, isCitizen: petition.is_citizen } : null}
            account={user ? { name: user.name ?? "", email: user.email, phone: user.phone ?? null } : null}
        />
    );
}
