import { Users, Building2, CalendarDays } from "lucide-react";
import { Link } from "@/i18n/routing";
import MeetingCard from "../meetings/MeetingCard";
import { SubjectCard } from "../subject-card";
import Marquee from "../ui/marquee";
import { type LandingPageCity } from "@/lib/db/landing";
import { CityMiniCard } from "./city-mini-card";

interface CityOverviewProps {
    city: LandingPageCity;
    showPrivateLabel?: boolean;
}

export function CityOverview({ city, showPrivateLabel }: CityOverviewProps) {
    const latestMeeting = city.mostRecentMeeting;

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="flex items-center gap-2 sm:gap-4">
                <CityMiniCard
                    city={city}
                    showPrivateLabel={showPrivateLabel}
                />
                <div className="flex-1 h-px bg-border"></div>
            </div>

            {/* Latest Meeting and Stats */}
            <div className="flex flex-col lg:flex-row gap-4">
                {/* Latest Meeting */}
                <div className="h-64 lg:flex-1">
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

                {/* Stats Stack */}
                <div className="grid grid-cols-3 lg:grid-cols-1 gap-3 lg:w-72">
                    {/* People */}
                    <div className="hover:bg-accent/50 rounded-lg p-3 sm:p-4 transition-colors">
                        <Link href={`/${city.id}?tab=members`} className="block">
                            <div className="flex items-center gap-2 font-semibold mb-1 sm:mb-2">
                                <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                                <h3 className="text-sm sm:text-base">{city.personCount} Πρόσωπα</h3>
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground">Δείτε όλα τα πρόσωπα</p>
                        </Link>
                    </div>

                    {/* Parties */}
                    <div className="hover:bg-accent/50 rounded-lg p-3 sm:p-4 transition-colors">
                        <Link href={`/${city.id}?tab=parties`} className="block">
                            <div className="flex items-center gap-2 font-semibold mb-1 sm:mb-2">
                                <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                <h3 className="text-sm sm:text-base">{city.partyCount} Παρατάξεις</h3>
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground">Δείτε όλες τις παρατάξεις</p>
                        </Link>
                    </div>

                    {/* Meetings */}
                    <div className="hover:bg-accent/50 rounded-lg p-3 sm:p-4 transition-colors">
                        <Link href={`/${city.id}?tab=meetings`} className="block">
                            <div className="flex items-center gap-2 font-semibold mb-1 sm:mb-2">
                                <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5" />
                                <h3 className="text-sm sm:text-base">{city.meetingCount || 0} Συνεδριάσεις</h3>
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground">Δείτε όλες τις συνεδριάσεις</p>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Subjects Marquee */}
            {city.recentSubjects.length > 0 && (
                <div className="w-full relative overflow-hidden rounded-lg">
                    <Marquee pauseOnHover repeat={2} className="[--duration:200s]" label="Πρόσφατα θέματα">
                        <div className="flex gap-4">
                            {city.recentSubjects.map((subject) => (
                                <div key={subject.id} className="w-[300px] sm:w-[360px] shrink-0">
                                    <SubjectCard
                                        subject={subject}
                                        city={city}
                                        meeting={latestMeeting}
                                        parties={city.parties}
                                    />
                                </div>
                            ))}
                        </div>
                    </Marquee>
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-white dark:from-background"></div>
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-white dark:from-background"></div>
                </div>
            )}
        </div>
    );
}