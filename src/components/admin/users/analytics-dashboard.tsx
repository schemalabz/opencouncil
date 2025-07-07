"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Users, Bell, FileText, TrendingUp, MapPin, Target } from "lucide-react"
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useState, useEffect } from "react"

interface UserAnalytics {
    totalUsers: number
    onboardedUsers: number
    usersWithNotifications: number
    usersWithPetitions: number
    newUsersThisWeek: number
    newUsersThisMonth: number
    growthPercentage: number
    registrationTimeline: Array<{
        date: string
        count: number
    }>
    cityDistribution: Array<{
        city: string
        notifications: number
        petitions: number
    }>
    topicPopularity: Array<{
        topic: string
        count: number
    }>
}

interface AnalyticsDashboardProps {
    dateRange: string
    onDateRangeChange: (range: string) => void
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

export function AnalyticsDashboard({ dateRange, onDateRangeChange }: AnalyticsDashboardProps) {
    const [analytics, setAnalytics] = useState<UserAnalytics | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchAnalytics() {
            try {
                const response = await fetch(`/api/admin/users/analytics?dateRange=${dateRange}`)
                if (!response.ok) throw new Error('Failed to fetch analytics')
                const data = await response.json()
                setAnalytics(data)
            } catch (error) {
                console.error('Failed to fetch analytics:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchAnalytics()
    }, [dateRange])

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <Card key={i}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Loading...</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-8 bg-muted animate-pulse rounded" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[...Array(3)].map((_, i) => (
                        <Card key={i}>
                            <CardContent className="p-6">
                                <div className="h-64 bg-muted animate-pulse rounded" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        )
    }

    if (!analytics) return <div className="text-center p-8">Loading analytics...</div>

    return (
        <div className="space-y-4">
            {/* Date Range Filter */}
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Analytics Dashboard</h2>
                <Select value={dateRange} onValueChange={onDateRangeChange}>
                    <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select date range" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7">Last 7 days</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                        <SelectItem value="all">All Time</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{analytics.totalUsers.toLocaleString()}</div>
                        <div className="flex items-center text-xs text-muted-foreground">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            {analytics.growthPercentage > 0 ? '+' : ''}{analytics.growthPercentage.toFixed(1)}% growth
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Onboarded Users</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{analytics.onboardedUsers.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            {((analytics.onboardedUsers / analytics.totalUsers) * 100).toFixed(1)}% of total
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">With Notifications</CardTitle>
                        <Bell className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{analytics.usersWithNotifications.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            {((analytics.usersWithNotifications / analytics.totalUsers) * 100).toFixed(1)}% of total
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">With Petitions</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{analytics.usersWithPetitions.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            {((analytics.usersWithPetitions / analytics.totalUsers) * 100).toFixed(1)}% of total
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* Registration Timeline */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Registration Timeline</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={analytics.registrationTimeline}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Area type="monotone" dataKey="count" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* City Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle>City Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={analytics.cityDistribution}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="city" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="notifications" fill="#8884d8" name="Notifications" />
                                <Bar dataKey="petitions" fill="#82ca9d" name="Petitions" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Topic Popularity */}
                <Card className="md:col-span-3">
                    <CardHeader>
                        <CardTitle>Topic Popularity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={analytics.topicPopularity}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={120}
                                    fill="#8884d8"
                                    dataKey="count"
                                    nameKey="topic"
                                >
                                    {analytics.topicPopularity.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
} 