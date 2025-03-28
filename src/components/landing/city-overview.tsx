"use client"
import { Users, Building2, CalendarDays } from "lucide-react";
import { Link } from "@/i18n/routing";
import MeetingCard from "../meetings/MeetingCard";
import { type LandingPageCity } from "@/lib/db/landing";
import { CityMiniCard } from "./city-mini-card";

interface CityOverviewProps {
    city: LandingPageCity;
    showPrivateLabel?: boolean;
}

export function CityOverview({ city, showPrivateLabel }: CityOverviewProps) {
    const latestMeeting = city.mostRecentMeeting;

    const statCard = (icon: React.ReactNode, title: string, subtitle: string, href: string) => (
        <Link href={href} className="block p-4 sm:p-5 relative overflow-hidden rounded-xl bg-gradient-to-br from-background to-muted/50 hover:shadow-lg transition-all duration-300 group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative space-y-2">
                <div className="flex items-center gap-2 text-primary">
                    {icon}
                    <h3 className="text-base sm:text-lg font-semibold">{title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
        </Link>
    );

    return (
        <div className="space-y-6 sm:space-y-8">
            <div className="flex items-center gap-4">
                <CityMiniCard
                    city={city}
                    showPrivateLabel={showPrivateLabel}
                />
                <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent"></div>
            </div>

            {/* Latest Meeting and Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
                {/* Latest Meeting */}
                <div className="h-auto lg:h-64">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3 lg:w-72">
                    {statCard(
                        <Users className="w-5 h-5 sm:w-6 sm:h-6" />,
                        `${city.personCount} Πρόσωπα`,
                        "Δείτε όλα τα πρόσωπα",
                        `/${city.id}?tab=members`
                    )}
                    {statCard(
                        <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />,
                        `${city.partyCount} Παρατάξεις`,
                        "Δείτε όλες τις παρατάξεις",
                        `/${city.id}?tab=parties`
                    )}
                    {statCard(
                        <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6" />,
                        `${city.meetingCount || 0} Συνεδριάσεις`,
                        "Δείτε όλες τις συνεδριάσεις",
                        `/${city.id}?tab=meetings`
                    )}
                </div>
            </div>
        </div>
    );
}