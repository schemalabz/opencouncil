import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";

/**
 * What "no results" does not mean.
 *
 * The search can only answer for meetings OpenCouncil has transcribed, and an
 * empty result set looks identical whether a council never discussed something
 * or the meeting was never covered. This says which of the two the reader is
 * looking at, and points at the section listing the covered period per δήμος.
 *
 * The caller gates this on `hasExplainPage` — it links into /explain, which
 * only the Greek realm has, and a link to a 404 is worse than no link at all.
 */
export async function SearchCoverageNote() {
    const t = await getTranslations("search");

    return (
        <div className="mx-auto w-full max-w-6xl px-4 pb-10">
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
                {t.rich("coverageNote", {
                    link: (chunks) => (
                        <Link
                            href="/explain#oc-coverage"
                            className="underline transition-colors hover:text-primary"
                        >
                            {chunks}
                        </Link>
                    ),
                })}
            </p>
        </div>
    );
}
