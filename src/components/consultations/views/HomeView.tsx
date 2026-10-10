"use client";

import Image from "next/image";
import { Clock } from "lucide-react";
import { Link } from "@/i18n/routing";
import { LocationSelector } from "@/components/onboarding/selectors/LocationSelector";
import type { CityWithGeometry } from "@/lib/db/cities";
import type { Location } from "@/lib/types/onboarding";
import { cn } from "@/lib/utils";
import MarkdownContent from "../MarkdownContent";
import type { RegulationData } from "../types";
import { cardClass, LinkRow, OpenCouncilCredit, pageClass, secondaryButtonClass, ViewLink } from "./ui";

export interface HomeViewProps {
    title: string;
    /** Two sentences on what is being decided; markdown, with `{REF:id}` links into the regulation. */
    intro?: string;
    regulationData: RegulationData;
    onReferenceClick: (entityId: string) => void;
    municipalityName?: string;
    cityLogoUrl?: string | null;
    cityHref: string;
    deadline: { active: boolean; label: string };
    /** Whether the regulation can answer "what changes at my address". */
    canLookUpAddress: boolean;
    cityData: CityWithGeometry | null;
    onAddress: (location: Location) => void;
    planHref?: string;
    /** The link to the full map; hidden on a computer, where the map is already beside this panel. */
    mapHref: string;
    commentsHref: string;
    commentCount: number;
    studyHref: string;
    /** The address the reader gave earlier in this visit, with the link back to its street. */
    savedAddress?: { text: string; href: string };
}

/** The first screen: what this is about, until when, and one question — where do you live? */
export default function HomeView({
    title,
    intro,
    regulationData,
    onReferenceClick,
    municipalityName,
    cityLogoUrl,
    cityHref,
    deadline,
    canLookUpAddress,
    cityData,
    onAddress,
    planHref,
    mapHref,
    commentsHref,
    commentCount,
    studyHref,
    savedAddress,
}: HomeViewProps) {
    return (
        <div className={cn(pageClass, "flex flex-col gap-5 px-5 pb-8 pt-8 lg:pt-6")}>
            {/* On a computer the top bar carries the municipality. */}
            <Link href={cityHref} className="flex items-center gap-3 self-start lg:hidden">
                {cityLogoUrl ? (
                    <Image src={cityLogoUrl} alt="" width={36} height={36} className="h-9 w-9 rounded-full bg-white object-contain" />
                ) : (
                    <span className="h-9 w-9 rounded-full bg-stone-900" aria-hidden="true" />
                )}
                <span className="text-sm leading-tight text-stone-600">
                    {municipalityName ?? 'Δήμος'}<br />Δημόσια διαβούλευση
                </span>
            </Link>

            <div className="flex flex-col gap-3">
                <h1 className="text-3xl font-bold leading-tight tracking-tight">{title}</h1>
                {intro && (
                    <MarkdownContent
                        content={intro}
                        className="text-[17px] leading-relaxed text-stone-700"
                        referenceFormat={regulationData.referenceFormat}
                        onReferenceClick={onReferenceClick}
                        regulationData={regulationData}
                    />
                )}
                <div className={cn(
                    "inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-sm font-semibold",
                    deadline.active ? "bg-[#ffedd5] text-[#7c2d12]" : "bg-stone-200 text-stone-700"
                )}>
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {deadline.label}
                </div>
            </div>

            {canLookUpAddress ? (
                <div className={cn(cardClass, "flex flex-col gap-3 p-5")}>
                    <label htmlFor="consultation-address" className="text-xl font-bold">Πού μένετε;</label>
                    {savedAddress && (
                        <ViewLink href={savedAddress.href} className="flex items-center justify-between gap-3 rounded-xl bg-[#fff7ed] px-4 py-3 text-base text-[#431407] hover:bg-[#ffedd5]">
                            <span className="min-w-0 truncate"><span className="font-semibold">{savedAddress.text}</span></span>
                            <span className="shrink-0 text-sm font-semibold text-[#9a3412]">Ο δρόμος σας</span>
                        </ViewLink>
                    )}
                    <p className="-mt-1 text-sm text-stone-600">Γράψτε τη διεύθυνσή σας και διαλέξτε την από τη λίστα για να δείτε τι αλλάζει στον δρόμο σας.</p>
                    {cityData ? (
                        <LocationSelector
                            selectedLocations={[]}
                            onSelect={onAddress}
                            onRemove={() => undefined}
                            city={cityData}
                            hideSelectedList
                            inputId="consultation-address"
                        />
                    ) : (
                        <input id="consultation-address" disabled placeholder="Φόρτωση…" className="h-12 rounded-xl border-[1.5px] border-stone-300 bg-stone-50 px-4 text-base" />
                    )}
                </div>
            ) : (
                <ViewLink href={mapHref} className={cn(secondaryButtonClass, "lg:hidden")}>Δείτε τον χάρτη</ViewLink>
            )}

            <nav aria-label="Η διαβούλευση" className={cn(cardClass, "overflow-hidden")}>
                {planHref && <LinkRow href={planHref}>Το σχέδιο σε 2 λεπτά</LinkRow>}
                {canLookUpAddress && <LinkRow href={mapHref} className="lg:hidden">Ο χάρτης, δρόμο προς δρόμο</LinkRow>}
                <LinkRow href={commentsHref} badge={commentCount > 0 ? <span className="text-sm">{commentCount}</span> : undefined}>
                    Τι λένε οι άλλοι δημότες
                </LinkRow>
                <LinkRow href={studyHref}>Ολόκληρη η μελέτη</LinkRow>
            </nav>

            <p className="px-1 text-sm leading-relaxed text-stone-600">
                Τα σχόλια φτάνουν στον Δήμο με το όνομά σας και δημοσιεύονται εδώ.
            </p>
            <OpenCouncilCredit />
        </div>
    );
}
