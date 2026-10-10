import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { NotificationSignup } from "@/components/notifications/signup/NotificationSignup";
import { getCurrentUser } from "@/lib/auth";
import { googleSignInAvailable } from "@/lib/auth/googleSignIn";
import { getAdministrativeBodiesWithPublicMeetingsCached, getCityCached } from "@/lib/cache";
import { getCity } from "@/lib/db/cities";
import { getSignupPreference } from "@/lib/db/signup";
import { getTopics } from "@/lib/db/topics";
import { getRealm } from "@/lib/realm.server";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";
import { bodyOffersUpdates, isSecondaryBody } from "@/lib/utils/bodyTier";
import { firstSearchParam } from "@/lib/utils/searchParams";
import { buildOgImageUrl } from "@/lib/og/locale";
import { signupOpenGraph } from "@/lib/og/signupMetadata";

export async function generateMetadata(props: { params: Promise<{ cityId: string; locale: string }> }): Promise<Metadata> {
    const { cityId, locale } = await props.params;
    const [city, t] = await Promise.all([getCityCached(cityId), getTranslations("notificationSignup")]);

    if (!city) {
        notFound();
    }

    const title = t("metaTitle");
    const description = t("metaDescription");
    return {
        title,
        description,
        ...signupOpenGraph(locale, title, description, buildOgImageUrl(locale, { pageType: "notifications", cityId })),
        alternates: await buildCanonicalAlternates(`/${cityId}/notifications`),
    };
}

interface PageProps {
    params: Promise<{ cityId: string }>;
    /** `q` is the search the picker row came from, so «Αλλαγή» can return to it. */
    searchParams: Promise<{ step?: string; q?: string | string[] }>;
}

/**
 * The signup for one municipality: step 1 explains, step 2 asks what
 * matters, step 3 asks where to write. `?step=2` is where the municipality
 * picker on /notifications lands — its readers have just read the explainer.
 * Notis is not asked here: the page shows at once, and the signup asks in
 * the background for step 3.
 */
export default async function NotificationSignupPage(props: PageProps) {
    const [{ cityId }, { step, q }] = await Promise.all([props.params, props.searchParams]);
    const [city, realm, user, requestHeaders, publicBodies] = await Promise.all([
        getCity(cityId, { includeGeometry: true }),
        getRealm(),
        getCurrentUser(),
        headers(),
        getAdministrativeBodiesWithPublicMeetingsCached(cityId),
    ]);

    if (!city) {
        notFound();
    }
    // A secondary body with a public meeting is offered behind a tick (#829).
    // A municipality that does not support notifications still offers the
    // secondary bodies whose updates are on: their admin switched them on
    // without the municipality, and the signup is the readers' only way to
    // them. The page then shows the bodies alone. With no such body, the
    // reader is sent to the petition.
    const secondary = publicBodies.filter(isSecondaryBody);
    const scope = city.supportsNotifications ? 'city' : 'bodies';
    const offered = scope === 'city' ? secondary : secondary.filter(body => bodyOffersUpdates(city, body));
    if (scope === 'bodies' && offered.length === 0) {
        redirect(`/${cityId}/petition`);
    }

    const [topics, existing] = await Promise.all([
        getTopics(realm),
        user ? getSignupPreference(user.id, city.id) : null,
    ]);
    // A body the reader follows stays on offer while it has no public
    // meeting, so the reader can still untick it.
    const bodies = new Map([...offered, ...(existing?.bodies ?? [])].map(body => [body.id, body]));

    return (
        <NotificationSignup
            city={city}
            scope={scope}
            topics={topics}
            secondaryBodies={[...bodies.values()]}
            initialStep={step === "2" ? 2 : 1}
            pickerQuery={firstSearchParam(q)}
            existing={existing}
            account={
                user
                    ? { name: user.name ?? "", email: user.email, phone: user.phone ?? null, notifyByPhone: user.notifyByPhone }
                    : null
            }
            googleAvailable={googleSignInAvailable(requestHeaders)}
        />
    );
}
