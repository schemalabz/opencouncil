'use client'
import { Party } from "@prisma/client";
import { useLocale } from "next-intl";
import React from "react";
import { Badge } from "./ui/badge";
import { useRouter } from "next/navigation";
import { getLocalizedName, getLocalizedShortName } from "@/lib/formatters/name";

export default function PartyBadge({ party, shortName, className }: { party: Party, shortName: boolean, className?: string }) {
    const locale = useLocale();
    const router = useRouter();
    let color = party.colorHex;
    const localizedName = shortName ? getLocalizedShortName(party, locale) : getLocalizedName(party, locale);

    return <Badge style={{ backgroundColor: color }} onClick={() => router.push(`/${party.cityId}/parties/${party.id}`)} className={`cursor-pointer ${className}`}>{localizedName}</Badge>
}