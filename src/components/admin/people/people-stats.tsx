import { Users, ImageIcon, Award, Volume2 } from "lucide-react";
import { StatsCard, StatsCardItem } from "@/components/ui/stats-card";

interface PeopleStatsProps {
    totalPeople: number;
    peopleWithRoles: number;
    peopleWithImages: number;
    peopleWithVoiceprints: number;
}

export function PeopleStats({
    totalPeople,
    peopleWithRoles,
    peopleWithImages,
    peopleWithVoiceprints,
}: PeopleStatsProps) {
    const statsItems: StatsCardItem[] = [
        {
            title: "Total People",
            value: totalPeople,
            icon: <Users className='h-5 w-5' />,
            description: "Total count of registered people",
        },
        {
            title: "With Roles",
            value: peopleWithRoles,
            percent: totalPeople ? Math.round((peopleWithRoles / totalPeople) * 100) : 0,
            icon: <Award className='h-5 w-5' />,
            description: "People with assigned roles",
        },
        {
            title: "With Profile Images",
            value: peopleWithImages,
            percent: totalPeople ? Math.round((peopleWithImages / totalPeople) * 100) : 0,
            icon: <ImageIcon className='h-5 w-5' />,
            description: "People with uploaded profile images",
        },
        {
            title: "With Voiceprints",
            value: peopleWithVoiceprints,
            percent: totalPeople ? Math.round((peopleWithVoiceprints / totalPeople) * 100) : 0,
            icon: <Volume2 className='h-5 w-5' />,
            description: "People with generated voiceprints",
        },
    ];

    return <StatsCard items={statsItems} columns={4} />;
}
