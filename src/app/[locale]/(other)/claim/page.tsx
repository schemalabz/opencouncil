import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { ClaimNotice } from "@/components/profile/ClaimNotice";
import { claimMessageKey, isClaimFailure } from "@/lib/utils/claimStatus";

// Reached from a QR scan only — nothing to index.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

/**
 * Where a signed-out scan of a code that cannot be claimed lands: expired or
 * forged, a person somebody already claimed, or a person that is gone. It
 * needs no account, so nobody signs up only to learn that the code is spent.
 * Any other status belongs on the profile.
 */
export default async function ClaimResultPage(props: { searchParams: Promise<{ claim?: string }> }) {
    const { claim } = await props.searchParams;
    const key = claimMessageKey(claim);
    if (!key || !isClaimFailure(key)) redirect("/profile");

    const t = await getTranslations("Profile");
    return (
        <div className="container max-w-2xl py-8 !px-3 sm:!px-8">
            <ClaimNotice
                variant="destructive"
                title={t("claim.title")}
                description={
                    key === "alreadyLinked" ? t("claim.alreadyLinked")
                    : key === "notFound" ? t("claim.notFound")
                    : t("claim.invalid")
                }
            />
        </div>
    );
}
