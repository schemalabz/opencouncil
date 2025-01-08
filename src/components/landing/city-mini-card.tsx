import Image from "next/image";
import { Link } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { type LandingPageCity } from "@/lib/db/landing";

interface CityMiniCardProps {
    city: LandingPageCity;
    showPrivateLabel?: boolean;
}

export function CityMiniCard({ city, showPrivateLabel }: CityMiniCardProps) {
    return (
        <Link href={`/${city.id}`}>
            <div className={cn(
                "flex items-center gap-2 sm:gap-4",
                "transform-gpu hover:translate-y-[-2px] transition-transform duration-200"
            )}>
                <div className="relative w-12 h-12 sm:w-16 sm:h-16">
                    <Image
                        src={city.logoImage}
                        alt={city.name}
                        fill
                        className="object-contain"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-light">{city.name}</h2>
                    {showPrivateLabel && (
                        <Badge variant="outline" className="flex items-center gap-1">
                            <EyeOff className="w-3 h-3" />
                            <span>unlisted</span>
                        </Badge>
                    )}
                </div>
            </div>
        </Link>
    );
} 