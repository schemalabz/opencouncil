"use client";

import { City } from "@prisma/client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CityCombobox } from "@/components/cities/CityCombobox";

interface CitySelectorProps {
    cities: City[];
    selectedCityId: string;
}

export default function CitySelector({ cities, selectedCityId }: CitySelectorProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const handleCityChange = (cityId: string) => {
        if (cityId === selectedCityId) return;

        // Create new URL with updated cityId
        const params = new URLSearchParams(searchParams);
        params.set("cityId", cityId);

        // Update the URL, which will trigger a new server fetch
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <CityCombobox
            cities={cities}
            value={selectedCityId || null}
            onChange={handleCityChange}
            placeholder="Select a city"
        />
    );
}
