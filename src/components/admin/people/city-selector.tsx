"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { City } from "@prisma/client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

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
        <Select value={selectedCityId} onValueChange={handleCityChange}>
            <SelectTrigger>
                <SelectValue placeholder='Select a city' />
            </SelectTrigger>
            <SelectContent>
                {cities.map(city => (
                    <SelectItem key={city.id} value={city.id}>
                        {city.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
