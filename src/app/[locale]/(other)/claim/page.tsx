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
 * the join flow at /{cityId}/join. Laid out as that flow's problem screen.
 */
export default async function ClaimResultPage(props: { searchParams: Promise<{ claim?: string }> }) {
    const { claim } = await props.searchParams;
    const t = await getTranslations("personJoin");
    return (
        <div className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50" aria-hidden>
                <XCircle className="h-7 w-7 text-red-600" />
            </span>
            <h1 className="mt-6 text-[26px] font-normal leading-tight tracking-[-0.01em] lg:text-[30px]">{t("problem.invalidTitle")}</h1>
            <p className="mt-3 text-[16px] leading-[1.5] text-muted-foreground">
                {claim === "not_found" ? t("problem.notFound") : t("problem.invalid")}
            </p>
        </div>
    );
}
