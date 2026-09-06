import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NotificationSignup } from "@/components/notifications/signup/NotificationSignup";
import type { ExistingPreference } from "@/components/notifications/signup/signup-state";
import { getCurrentUser } from "@/lib/auth";
import { getCityCached } from "@/lib/cache";
import { getCity } from "@/lib/db/cities";
import { getUserPreferences } from "@/lib/db/notifications";
import { getTopics } from "@/lib/db/topics";
import { getNotisSubscription } from "@/lib/notis/client";
import { getRealm } from "@/lib/realm.server";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";

export async function generateMetadata(props: { params: Promise<{ cityId: string }> }): Promise<Metadata> {
    const params = await props.params;
    const [city, t] = await Promise.all([getCityCached(params.cityId), getTranslations("notificationSignup")]);

    if (!city) {
        notFound();
    }

    return {
        title: t("metaTitle"),
        description: t("metaDescription"),
        alternates: await buildCanonicalAlternates(`/${params.cityId}/notifications`),
    };
}

interface PageProps {
    params: Promise<{ cityId: string }>;
    searchParams: Promise<{ step?: string }>;
}

/**
 * The signup for one municipality: step 1 explains, step 2 asks what
 * matters, step 3 asks where to write. `?step=2` is where the municipality
 * picker on /notifications lands — its readers have just read the explainer.
 */
export default async function NotificationSignupPage(props: PageProps) {
    const [{ cityId }, { step }] = await Promise.all([props.params, props.searchParams]);
    const [city, realm, user] = await Promise.all([
        getCity(cityId, { includeGeometry: true }),
        getRealm(),
        getCurrentUser(),
    ]);

    if (!city) {
        notFound();
    }
    if (!city.supportsNotifications) {
        redirect(`/${cityId}/petition`);
    }

    const [topics, preferences, notis] = await Promise.all([
        getTopics(realm),
        user ? getUserPreferences() : Promise.resolve([]),
        user ? getNotisSubscription(user.id) : Promise.resolve(null),
    ]);

    const saved = preferences.find((p) => p.cityId === city.id && !p.isPetition);
    const existing: ExistingPreference | null = saved
        ? {
              locations: saved.locations ?? [],
              topics: saved.topics ?? [],
              notifyByPhone: saved.notifyByPhone ?? true,
              notifyByEmail: saved.notifyByEmail ?? true,
          }
        : null;

    return (
        <NotificationSignup
            city={city}
            topics={topics}
            initialStep={step === "2" ? 2 : 1}
            existing={existing}
            account={user ? { name: user.name ?? "", email: user.email, phone: user.phone ?? null } : null}
            notisStatus={notis?.ok ? (notis.data?.status ?? null) : null}
        />
    );
}
