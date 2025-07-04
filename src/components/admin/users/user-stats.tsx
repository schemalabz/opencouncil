import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Bell, FileText, Target, TrendingUp, Calendar } from "lucide-react"

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
    return (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6 mb-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalUsers}</div>
                    <p className="text-xs text-muted-foreground">Registered users</p>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Onboarded</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{onboardedUsers}</div>
                    <p className="text-xs text-muted-foreground">
                        {totalUsers > 0 ? ((onboardedUsers / totalUsers) * 100).toFixed(1) : '0'}% of total
                    </p>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Contactable</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{contactableUsers}</div>
                    <p className="text-xs text-muted-foreground">
                        {totalUsers > 0 ? ((contactableUsers / totalUsers) * 100).toFixed(1) : '0'}% of total
                    </p>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">With Notifications</CardTitle>
                    <Bell className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{usersWithNotifications}</div>
                    <p className="text-xs text-muted-foreground">
                        {totalUsers > 0 ? ((usersWithNotifications / totalUsers) * 100).toFixed(1) : '0'}% of total
                    </p>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">With Petitions</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{usersWithPetitions}</div>
                    <p className="text-xs text-muted-foreground">
                        {totalUsers > 0 ? ((usersWithPetitions / totalUsers) * 100).toFixed(1) : '0'}% of total
                    </p>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">New This Week</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{newUsersThisWeek}</div>
                    <p className="text-xs text-muted-foreground">
                        {newUsersThisMonth > 0 ? ((newUsersThisWeek / newUsersThisMonth) * 100).toFixed(1) : '0'}% of month
                    </p>
                </CardContent>
            </Card>
        </div>
    )
} 