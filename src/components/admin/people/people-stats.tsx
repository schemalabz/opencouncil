import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ImageIcon, Award, Volume2 } from "lucide-react";

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
    const statsItems = [
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

    return (
        <div className='grid gap-4 md:grid-cols-4 mb-6'>
            {statsItems.map(item => (
                <Card key={item.title}>
                    <CardHeader className='flex flex-row items-center justify-between pb-2'>
                        <CardTitle className='text-sm font-medium'>{item.title}</CardTitle>
                        <div className='text-muted-foreground rounded-full p-1'>{item.icon}</div>
                    </CardHeader>
                    <CardContent>
                        <div className='text-2xl font-bold'>
                            {item.value}
                            {item.percent !== undefined && (
                                <span className='text-sm font-normal text-muted-foreground ml-2'>
                                    ({item.percent}%)
                                </span>
                            )}
                        </div>
                        <p className='text-xs text-muted-foreground'>{item.description}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
