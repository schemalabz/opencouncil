import { Party } from "@prisma/client";
import { useLocale } from "next-intl";
import React from "react";
import { Badge } from "./ui/badge";

export default function PartyBadge({ party, shortName }: { party: Party, shortName: boolean }) {
    const locale = useLocale();
    let color = party.colorHex;
    let localizedName: string;
    if (shortName) {
        localizedName = (locale === 'el') ? party.name_short : party.name_short_en;
    } else {
        localizedName = (locale === 'el') ? party.name : party.name_en;
    }

    return <Badge style={{ backgroundColor: color }}>{localizedName}</Badge>
}