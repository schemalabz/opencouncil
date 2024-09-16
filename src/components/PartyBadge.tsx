'use client'
import { Party } from "@prisma/client";
import { useLocale } from "next-intl";
import React from "react";
import { Badge } from "./ui/badge";
import { useRouter } from "next/navigation";

export default function PartyBadge({ party, shortName, className }: { party: Party, shortName: boolean, className?: string }) {
    const locale = useLocale();
    const router = useRouter();
    let color = party.colorHex;
    let localizedName: string;
    if (shortName) {
        localizedName = (locale === 'el') ? party.name_short : party.name_short_en;
    } else {
        localizedName = (locale === 'el') ? party.name : party.name_en;
    }

    return <Badge style={{ backgroundColor: color }} onClick={() => router.push(`/${party.cityId}/parties/${party.id}`)} className={`cursor-pointer ${className}`}>{localizedName}</Badge>
}