"use client"

import { Globe, ChevronDown } from "lucide-react"
import { Realm } from "@prisma/client"
import { useTranslations } from "next-intl"
import Combobox from "@/components/Combobox"
import { ALL_REALMS, REALMS, getRealmBaseUrl, getRealmDisplayName } from "@/lib/realm"

// Keep endonyms for realms with a translated UI and English names for the rest.
const countryLabel = (realm: Realm) => getRealmDisplayName(realm, REALMS[realm].defaultLocale)

function CountryTrigger({ item, isOpen }: { item: Realm | null; isOpen: boolean }) {
    return (
        <button type="button" aria-haspopup="dialog" aria-label={item ? countryLabel(item) : undefined} aria-expanded={isOpen}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{item ? countryLabel(item) : ""}</span>
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
        </button>
    )
}

/** Uses the shared searchable popover on desktop and bottom-sheet dialog on phones. */
export default function CountrySwitcher({ realm }: { realm: Realm }) {
    const t = useTranslations("Footer")
    return (
        <Combobox<Realm>
            items={ALL_REALMS}
            value={realm}
            onChange={(target) => {
                if (target && target !== realm) window.location.href = getRealmBaseUrl(target)
            }}
            placeholder={t("selectCountry")}
            searchPlaceholder={t("searchCountry")}
            emptyMessage={t("noCountries")}
            getItemLabel={countryLabel}
            getItemValue={(target) => target}
            TriggerComponent={CountryTrigger}
            className="w-72"
        />
    )
}
