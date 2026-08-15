import { Building2 } from "lucide-react";
import { useLocale } from "next-intl";
import { CityWithGeometry } from "@/lib/db/cities";
import { getLocalizedName } from "@/lib/formatters/name";

interface SlideHeaderProps {
    city: CityWithGeometry;
}

export default function SlideHeader({ city }: SlideHeaderProps) {
    const locale = useLocale();
    const cityName = getLocalizedName(city, locale);

    return (
        <div className="flex items-center gap-8 px-[5vw] pt-[3vh]">
            {city.logoImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={city.logoImage}
                    alt={cityName}
                    className="h-[12vh] w-auto max-w-[240px] object-contain flex-shrink-0"
                />
            ) : (
                <Building2 className="h-[12vh] w-[12vh] text-muted-foreground flex-shrink-0" />
            )}
            <div className="text-[4vh] font-semibold truncate">{cityName}</div>
        </div>
    );
}
