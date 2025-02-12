"use client"
import { Users, Building2, CalendarDays } from "lucide-react";
import { Link } from "@/i18n/routing";
import MeetingCard from "../meetings/MeetingCard";
import { SubjectCard } from "../subject-card";
import Marquee from "../ui/marquee";
import { type LandingPageCity } from "@/lib/db/landing";
import { CityMiniCard } from "./city-mini-card";
import { motion } from "framer-motion";

interface CityOverviewProps {
    city: LandingPageCity;
    showPrivateLabel?: boolean;
}

export function CityOverview({ city, showPrivateLabel }: CityOverviewProps) {
    const latestMeeting = city.mostRecentMeeting;

    const container = {
        hidden: { opacity: 0, y: 20 },
        show: {
            opacity: 1,
            y: 0,
            transition: {
                duration: 0.5,
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0 }
    };

    const statCard = (icon: React.ReactNode, title: string, subtitle: string, href: string) => (
        <motion.div
            variants={item}
            whileHover={{ scale: 1.02 }}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-background to-muted/50 hover:shadow-lg transition-all duration-300"
        >
            <Link href={href} className="block p-4 sm:p-5">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative space-y-2">
                    <div className="flex items-center gap-2 text-primary">
                        {icon}
                        <h3 className="text-base sm:text-lg font-semibold">{title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                </div>
            </Link>
        </motion.div>
    );

    return (
        <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            className="space-y-6 sm:space-y-8"
        >
            <motion.div variants={item} className="flex items-center gap-4">
                <CityMiniCard
                    city={city}
                    showPrivateLabel={showPrivateLabel}
                />
                <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent"></div>
            </motion.div>

            {/* Latest Meeting and Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
                {/* Latest Meeting */}
                <motion.div variants={item} className="h-auto lg:h-64">
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
                </motion.div>

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

            {/* Subjects Marquee */}
            {city.recentSubjects.length > 0 && (
                <motion.div
                    variants={item}
                    className="relative overflow-hidden rounded-xl bg-gradient-to-br from-background to-muted/50 z-0"
                >
                    <Marquee
                        pauseOnHover
                        repeat={2}
                        className="[--duration:200s] py-4"
                        label="Πρόσφατα θέματα"
                    >
                        <div className="flex gap-4">
                            {city.recentSubjects.map((subject) => (
                                <motion.div
                                    key={subject.id}
                                    whileHover={{ scale: 1.02 }}
                                    className="w-[300px] sm:w-[360px] shrink-0"
                                >
                                    <SubjectCard
                                        subject={subject}
                                        city={city}
                                        meeting={latestMeeting}
                                        parties={city.parties}
                                    />
                                </motion.div>
                            ))}
                        </div>
                    </Marquee>
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-background to-transparent z-10"></div>
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-background to-transparent z-10"></div>
                </motion.div>
            )}
        </motion.div>
    );
}