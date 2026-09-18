import { getTranslations } from "next-intl/server";
import { Metadata } from "next";
import { XCircle } from "lucide-react";

// Reached from a QR scan only — nothing to index.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

/**
 * Where /api/join sends a code it cannot place in a city: forged, expired,
 * or for a person that is gone. Every other outcome of a scan is a step of
 * the join flow at /{cityId}/join.
 */
export default async function ClaimResultPage(props: { searchParams: Promise<{ claim?: string }> }) {
    const { claim } = await props.searchParams;
    const t = await getTranslations("personJoin");
    return (
        <div className="container max-w-md py-24 flex flex-col items-center gap-4 text-center">
            <XCircle className="h-12 w-12 text-destructive" />
            <h1 className="text-xl font-semibold">{t("problem.invalidTitle")}</h1>
            <p className="text-muted-foreground">{claim === "not_found" ? t("problem.notFound") : t("problem.invalid")}</p>
        </div>
    );
}
