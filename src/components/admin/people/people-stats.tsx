import { Users, ImageIcon, Award, Volume2, UserCog, ShieldCheck } from "lucide-react";
import { StatsCard, StatsCardItem } from "@/components/ui/stats-card";

interface PeopleStatsProps {
    totalPeople: number;
    peopleWithRoles: number;
    peopleWithImages: number;
    peopleWithVoiceprints: number;
    peopleWithAccounts: number;
    peopleWithVoiceprintConsent: number;
}

export function PeopleStats({
    totalPeople,
    peopleWithRoles,
    peopleWithImages,
    peopleWithVoiceprints,
    peopleWithAccounts,
    peopleWithVoiceprintConsent,
}: PeopleStatsProps) {
    const percentOfTotal = (value: number) => (totalPeople ? Math.round((value / totalPeople) * 100) : 0);

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
            percent: percentOfTotal(peopleWithRoles),
            icon: <Award className='h-5 w-5' />,
            description: "People with assigned roles",
        },
        {
            title: "With Profile Images",
            value: peopleWithImages,
            percent: percentOfTotal(peopleWithImages),
            icon: <ImageIcon className='h-5 w-5' />,
            description: "People with uploaded profile images",
        },
        {
            title: "With Voiceprints",
            value: peopleWithVoiceprints,
            percent: percentOfTotal(peopleWithVoiceprints),
            icon: <Volume2 className='h-5 w-5' />,
            description: "People with generated voiceprints",
        },
        {
            title: "With Accounts",
            value: peopleWithAccounts,
            percent: percentOfTotal(peopleWithAccounts),
            icon: <UserCog className='h-5 w-5' />,
            description: "People an account manages",
        },
        {
            title: "With Voiceprint Consent",
            value: peopleWithVoiceprintConsent,
            percent: percentOfTotal(peopleWithVoiceprintConsent),
            icon: <ShieldCheck className='h-5 w-5' />,
            description: "People whose voiceprint consent is in force",
        },
    ];

    return <StatsCard items={statsItems} columns={6} />;
}
