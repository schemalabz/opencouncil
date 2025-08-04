import { Users, Bell, FileText, Target, TrendingUp, Calendar } from "lucide-react"
import { StatsCard, StatsCardItem } from "@/components/ui/stats-card"

interface UserStatsProps {
    totalUsers: number
    onboardedUsers: number
    contactableUsers: number
    usersWithNotifications?: number
    usersWithPetitions?: number
    newUsersThisWeek?: number
    newUsersThisMonth?: number
}

export function UserStats({ 
    totalUsers, 
    onboardedUsers, 
    contactableUsers,
    usersWithNotifications = 0,
    usersWithPetitions = 0,
    newUsersThisWeek = 0,
    newUsersThisMonth = 0
}: UserStatsProps) {
    const statsItems: StatsCardItem[] = [
        {
            title: "Total Users",
            value: totalUsers,
            icon: <Users className="h-4 w-4" />,
            description: "Registered users",
        },
        {
            title: "Onboarded",
            value: onboardedUsers,
            percent: totalUsers > 0 ? parseFloat(((onboardedUsers / totalUsers) * 100).toFixed(1)) : 0,
            icon: <Target className="h-4 w-4" />,
            description: "Percentage of total users",
        },
        {
            title: "Contactable",
            value: contactableUsers,
            percent: totalUsers > 0 ? parseFloat(((contactableUsers / totalUsers) * 100).toFixed(1)) : 0,
            icon: <TrendingUp className="h-4 w-4" />,
            description: "Percentage of total users",
        },
        {
            title: "With Notifications",
            value: usersWithNotifications,
            percent: totalUsers > 0 ? parseFloat(((usersWithNotifications / totalUsers) * 100).toFixed(1)) : 0,
            icon: <Bell className="h-4 w-4" />,
            description: "Percentage of total users",
        },
        {
            title: "With Petitions",
            value: usersWithPetitions,
            percent: totalUsers > 0 ? parseFloat(((usersWithPetitions / totalUsers) * 100).toFixed(1)) : 0,
            icon: <FileText className="h-4 w-4" />,
            description: "Percentage of total users",
        },
        {
            title: "New This Week",
            value: newUsersThisWeek,
            percent: newUsersThisMonth > 0 ? parseFloat(((newUsersThisWeek / newUsersThisMonth) * 100).toFixed(1)) : 0,
            icon: <Calendar className="h-4 w-4" />,
            description: "Percentage of month",
        },
    ];

    return <StatsCard items={statsItems} columns={6} />;
} 