import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessMyHighlights } from "@/lib/db/highlights";
import { UserInfoForm, type ConsentPerson } from "@/components/profile/UserInfoForm";
import { AdminSection } from "@/components/profile/AdminSection";
import { DevelopmentSection } from "@/components/profile/DevelopmentSection";
import { showsDevelopmentSection } from "@/components/profile/dev-tools";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileSettings, type ProfileAccount } from "@/components/profile/ProfileSettings";
import { NotisInviteCard } from "@/components/signup/NotisInviteCard";
import { StepHeading } from "@/components/signup/SignupChrome";
import { getVoicePrintConsents } from "@/lib/db/personConsent";
import { hasNotificationPreference } from "@/lib/db/signup";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { env } from "@/env.mjs";

// Personalized page behind sign-in — nothing to index.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export default async function ProfilePage() {
    const user = await getCurrentUser();
    if (!user) redirect("/sign-in");
    // The persons this account administers, by a QR claim or given by a
    // superadmin: their voiceprint consent boxes.
    const linkedPersons = user.administers.flatMap((a) => (a.person ? [{ person: a.person, claimed: a.claimedAt !== null }] : []));
    const consents = await getVoicePrintConsents(linkedPersons.map((l) => l.person.id));
    const persons: ConsentPerson[] = linkedPersons.map(({ person, claimed }) => ({
        id: person.id,
        name: person.name,
        claimed,
        consent: consents.get(person.id) ?? null,
    }));
    const [t, highlightsAllowed, signedUp] = await Promise.all([
        getTranslations("Profile"),
        canAccessMyHighlights(),
        // Only the settings view invites; the onboarding form does not ask.
        user.onboarded ? hasNotificationPreference(user.id) : true,
    ]);
    const isPreview = env.DEPLOYMENT_ENV === 'preview';
    const showDevTools = showsDevelopmentSection(isPreview);
    const administersSomething = user.isSuperAdmin || user.administers.length > 0;
    // Only what the settings edit crosses to the client; the row's relations
    // (the cities and persons it administers) stay here.
    const account: ProfileAccount = {
        name: user.name,
        email: user.email,
        phone: user.phone,
        updatedAt: user.updatedAt,
        allowProductUpdates: user.allowProductUpdates,
        allowPetitionUpdates: user.allowPetitionUpdates,
        allowFeedbackCalls: user.allowFeedbackCalls,
    };

    // The first visit is one question, laid out like a signup step: the
    // details, and the button that completes the registration. The settings
    // wait behind it.
    if (!user.onboarded) {
        return (
            <div className="mx-auto w-full max-w-md px-4 pb-16 lg:max-w-lg">
                <StepHeading title={t("welcomeOnboard")} lead={t("onboardingDescription")} className="pt-8 lg:pt-12" />
                <div className="mt-7">
                    <UserInfoForm user={account} isOnboarded={false} persons={persons} />
                </div>
                {showDevTools && (
                    <div className="mt-10">
                        <DevelopmentSection isPreview={isPreview} />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-5xl px-4 pb-16 lg:px-6 lg:pb-24">
            <ProfileHeader name={user.name} email={user.email} createdAt={user.createdAt} />
            <ProfileSettings
                user={account}
                persons={persons}
                highlightsAllowed={highlightsAllowed}
                // Offered to a reader on no municipality's list, which includes one
                // who deleted their last municipality. An unsubscribe keeps the
                // row, so it does not bring the offer back.
                promo={signedUp ? undefined : <NotisInviteCard surface="profile" />}
                aside={administersSomething || showDevTools ? (
                    <>
                        {administersSomething && <AdminSection user={user} t={t} />}
                        {showDevTools && <DevelopmentSection isPreview={isPreview} />}
                    </>
                ) : undefined}
            />
        </div>
    );
}
