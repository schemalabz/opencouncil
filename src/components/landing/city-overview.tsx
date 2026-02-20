'use client';

import { Users, Building2, CalendarDays, BadgeX } from "lucide-react";
import { Link, useRouter } from "@/i18n/routing";
import MeetingCard from "../meetings/MeetingCard";
import { LandingCity } from "@/lib/db/landing";
import { CityMiniCard } from "./city-mini-card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface CityOverviewProps {
    city: LandingCity;
    showPrivateLabel?: boolean;
}

export function CityOverview({ city, showPrivateLabel }: CityOverviewProps) {
    const router = useRouter();
    const latestMeeting = city.mostRecentMeeting;

    const statCard = (icon: React.ReactNode, title: string, subtitle: string, href: string, index: number) => {
        // Use accent color for all icons but maintain alternating border colors
        const isAccent = index % 2 === 0;
        const hoverBorderClass = isAccent ? "hover:border-accent/30" : "hover:border-orange/30";

        return (
            <Link
                href={href}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    "block p-4 sm:p-5 relative overflow-hidden rounded-xl h-full z-10",
                    "bg-gradient-to-br from-background to-muted/50",
                    "border border-border", hoverBorderClass,
                    "hover:shadow-md transition-all duration-300 group"
                )}
            >
                <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-orange/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity animate-gradientFlow" />
                <div className="relative space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="text-accent">
                            {icon}
                        </div>
                        <h3 className="text-base sm:text-lg font-semibold text-primary group-hover:text-primary/90 transition-colors">{title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground group-hover:text-secondary-foreground transition-colors ml-0.5">{subtitle}</p>
                </div>
            </Link>
        );
    };

    const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Only navigate if clicking on the card itself, not on nested links or buttons
        const target = e.target as HTMLElement;
        const isLink = target.closest('a');
        const isButton = target.closest('button');

        if (!isLink && !isButton) {
            router.push(`/${city.id}`);
        }
    };

    return (
        <div
            onClick={handleCardClick}
            className="block space-y-6 sm:space-y-8 cursor-pointer group/overview"
        >
            <div className="flex items-center gap-4">
                <CityMiniCard
                    city={city}
                    showPrivateLabel={showPrivateLabel}
                />
                <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent"></div>
            </div>

            {/* Unofficial support badge */}
            {!city.officialSupport && (
                <div className="flex">
                    <Badge variant="outline" className="gap-2 text-muted-foreground py-1.5 px-3">
                        <BadgeX className="w-4 h-4" />
                        <span>Χωρίς την υποστήριξη {city.authorityType === "municipality" ? "του δήμου" : "της περιφέρειας"}</span>
                    </Badge>
                </div>
            )}

            {/* Latest Meeting and Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-stretch">
                {/* Latest Meeting */}
                <div className="h-full" onClick={(e) => e.stopPropagation()}>
                    {latestMeeting && (
                        <MeetingCard
                            item={{
                                ...latestMeeting,
                                cityId: city.id
                            }}
                            editable={false}
                            mostRecent={true}
                        />
                    )}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4 lg:w-80 h-full">
                    {statCard(
                        <Users className="w-5 h-5 sm:w-6 sm:h-6" />,
                        `${city._count.persons} Πρόσωπα`,
                        "Δείτε όλα τα πρόσωπα",
                        `/${city.id}/people`,
                        0
                    )}
                    {statCard(
                        <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />,
                        `${city._count.parties} Παρατάξεις`,
                        "Δείτε όλες τις παρατάξεις",
                        `/${city.id}/parties`,
                        1
                    )}
                    {statCard(
                        <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6" />,
                        `${city._count.councilMeetings || 0} Συνεδριάσεις`,
                        "Δείτε όλες τις συνεδριάσεις",
                        `/${city.id}`,
                        2
                    )}
                </div>
            </div>
        </div>
    );
}