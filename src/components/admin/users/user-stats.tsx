import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface UserStatsProps {
    totalUsers: number
    onboardedUsers: number
    contactableUsers: number
}

export function UserStats({ totalUsers, onboardedUsers, contactableUsers }: UserStatsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-3 mb-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalUsers}</div>
                    <p className="text-xs text-muted-foreground">Registered users</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Onboarded Users</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{onboardedUsers}</div>
                    <p className="text-xs text-muted-foreground">{((onboardedUsers / totalUsers) * 100).toFixed(1)}% of total users</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Contactable Users</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{contactableUsers}</div>
                    <p className="text-xs text-muted-foreground">{((contactableUsers / totalUsers) * 100).toFixed(1)}% of total users</p>
                </CardContent>
            </Card>
        </div>
    )
} 