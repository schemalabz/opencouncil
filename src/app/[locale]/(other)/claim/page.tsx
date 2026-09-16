import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { QrCode, XCircle } from "lucide-react";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { DropClaimParam } from "@/components/profile/ClaimNotice";
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
 *
 * A signed-out scan cannot tell whose account holds the person: it may be the
 * councillor's own, scanned again from another browser. So the text offers
 * sign-in before it offers the team.
 */
export default async function ClaimResultPage(props: { searchParams: Promise<{ claim?: string }> }) {
    const { claim } = await props.searchParams;
    const key = claimMessageKey(claim);
    if (!key || !isClaimFailure(key)) redirect("/profile");

    const t = await getTranslations("Profile");
    const used = key === "alreadyLinked";
    return (
        <div className="container max-w-md py-24 flex flex-col items-center gap-4 text-center">
            <DropClaimParam />
            {used ? (
                <QrCode className="h-12 w-12 text-muted-foreground" />
            ) : (
                <XCircle className="h-12 w-12 text-destructive" />
            )}
            <h1 className="text-xl font-semibold">{used ? t("claim.usedTitle") : t("claim.invalidTitle")}</h1>
            <p className="text-muted-foreground">
                {used ? t("claim.usedSignedOut") : key === "notFound" ? t("claim.notFound") : t("claim.invalid")}
            </p>
            {used && (
                <Button asChild>
                    <Link href="/sign-in">{t("claim.signIn")}</Link>
                </Button>
            )}
        </div>
    );
}
