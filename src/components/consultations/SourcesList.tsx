import { ExternalLink } from "lucide-react";
import type { Realm } from "@prisma/client";
import { Link } from "@/i18n/routing";
import { getRealmContactPhone } from "@/lib/realm";
import { cn } from "@/lib/utils";
import { Source } from "./types";
import { cardClass, SectionLabel, textLinkClass } from "./views/ui";

interface SourcesListProps {
    sources: Source[];
    /** the request's realm, resolved server-side — picks the support phone number */
    realm: Realm;
    contactEmail: string;
    ccEmails?: string[];
    consultationId?: string;
    cityId?: string;
}

/** The end of the study: the documents it comes from, and who gets the comments. */
export default function SourcesList({
    sources,
    contactEmail,
    ccEmails,
    consultationId,
    cityId,
    realm
}: SourcesListProps) {
    return (
        <>
            {sources.length > 0 && (
                <section id="consultation-sources" aria-label="Πηγές" className="flex scroll-mt-16 flex-col gap-3 sm:scroll-mt-24">
                    <SectionLabel>Πηγές</SectionLabel>
                    <ul className={cn(cardClass, "overflow-hidden")}>
                        {sources.map((source, index) => (
                            <li key={`${source.url}-${index}`} className="border-b border-stone-100 last:border-b-0">
                                <a href={source.url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-0.5 px-4 py-3.5 hover:bg-stone-50">
                                    <span className="flex items-center gap-2 text-[17px] font-semibold text-[#9a3412]">
                                        {source.title}
                                        <ExternalLink className="h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />
                                    </span>
                                    {source.description && <span className="text-[15px] leading-snug text-stone-600">{source.description}</span>}
                                </a>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section id="consultation-contact" aria-label="Επικοινωνία" className="flex scroll-mt-16 flex-col gap-3 sm:scroll-mt-24">
                <SectionLabel>Επικοινωνία</SectionLabel>
                <div className={cn(cardClass, "flex flex-col gap-2.5 p-5 text-[17px] leading-relaxed text-stone-700")}>
                    <p>
                        Τα σχόλια που αφήνετε εδώ φτάνουν στον Δήμο στο <a href={`mailto:${contactEmail}`} className={textLinkClass}>{contactEmail}</a>.
                        {' '}Μπορείτε να γράψετε και απευθείας εκεί.
                        {ccEmails && ccEmails.length > 0 && ` Κοινοποίηση: ${ccEmails.join(', ')}.`}
                    </p>
                    <p>
                        Για την εφαρμογή, η <Link href="/about" className={textLinkClass}>OpenCouncil</Link>: <a href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL}`} className={textLinkClass}>{process.env.NEXT_PUBLIC_CONTACT_EMAIL}</a> · {getRealmContactPhone(realm)}.
                    </p>
                    {consultationId && cityId && (
                        <Link href={`/${cityId}/consultation/${consultationId}/comments`} className={cn(textLinkClass, "text-[15px]")}>
                            Όλα τα σχόλια σε μορφή για εκτύπωση
                        </Link>
                    )}
                </div>
            </section>
        </>
    );
}
