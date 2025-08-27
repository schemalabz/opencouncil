"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useMemo, useState } from "react"
import { UserWithRelations } from "@/lib/db/users"
import { subDays, format, startOfWeek } from 'date-fns'

interface AnalyticsDashboardProps {
    users: UserWithRelations[]
    dateRange: string
    onDateRangeChange: (range: string) => void
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

export function AnalyticsDashboard({ users, dateRange, onDateRangeChange }: AnalyticsDashboardProps) {
    const [aggregateByWeek, setAggregateByWeek] = useState(false)

    const analytics = useMemo(() => {
        const dateCutoff = dateRange === 'all' ? null : subDays(new Date(), parseInt(dateRange, 10))

        const filteredUsers = dateCutoff
            ? users.filter(user => new Date(user.createdAt) >= dateCutoff)
            : users

        const growthPercentage = (() => {
            if (dateRange === 'all' || isNaN(parseInt(dateRange, 10))) return 0

            const days = parseInt(dateRange, 10)
            const previousPeriodCutoff = subDays(new Date(), days * 2)
            const currentPeriodCutoff = subDays(new Date(), days)

            const previousFilteredUsers = users.filter(user => {
                const createdAt = new Date(user.createdAt)
                return createdAt < currentPeriodCutoff && createdAt >= previousPeriodCutoff
            })

            if (previousFilteredUsers.length === 0) {
                return filteredUsers.length > 0 ? 100 : 0
            }

            return ((filteredUsers.length - previousFilteredUsers.length) / previousFilteredUsers.length) * 100
        })()

        const registrationTimeline = (() => {
            // Determine date range
            const endDate = new Date()
            let startDate: Date

            if (dateRange === 'all') {
                // Find earliest user registration date, or use 30 days ago as fallback
                const earliestUser = users.reduce((earliest, user) => {
                    const userDate = new Date(user.createdAt)
                    return !earliest || userDate < earliest ? userDate : earliest
                }, null as Date | null)
                startDate = earliestUser || subDays(endDate, 30)
            } else {
                startDate = subDays(endDate, parseInt(dateRange, 10))
            }

            // Create complete date range with zero counts
            const dateRange_array: Array<{ date: string; count: number }> = []
            const currentDate = new Date(startDate)

            while (currentDate <= endDate) {
                dateRange_array.push({
                    date: format(currentDate, 'yyyy-MM-dd'),
                    count: 0
                })
                currentDate.setDate(currentDate.getDate() + 1)
            }

            // Fill in actual registration counts
            filteredUsers.forEach(user => {
                const date = format(new Date(user.createdAt), 'yyyy-MM-dd')
                const entry = dateRange_array.find(e => e.date === date)
                if (entry) {
                    entry.count++
                }
            })

            // Aggregate by week if enabled and date range is 30+ days
            const shouldAggregateByWeek = aggregateByWeek && (dateRange === 'all' || parseInt(dateRange, 10) >= 30)

            if (shouldAggregateByWeek) {
                const weeklyData: Array<{ date: string; count: number }> = []
                const weekGroups = new Map<string, number>()

                dateRange_array.forEach(entry => {
                    const weekStart = startOfWeek(new Date(entry.date), { weekStartsOn: 1 }) // Monday start
                    const weekKey = format(weekStart, 'yyyy-MM-dd')

                    if (weekGroups.has(weekKey)) {
                        weekGroups.set(weekKey, weekGroups.get(weekKey)! + entry.count)
                    } else {
                        weekGroups.set(weekKey, entry.count)
                    }
                })

                // Convert to array and sort
                weekGroups.forEach((count, date) => {
                    weeklyData.push({ date, count })
                })

                return weeklyData.sort((a, b) => a.date.localeCompare(b.date))
            }

            return dateRange_array
        })()

        const cityDistribution = filteredUsers.reduce((acc, user) => {
            user.notificationPreferences.forEach(pref => {
                const city = pref.city.name
                let entry = acc.find(e => e.city === city)
                if (!entry) {
                    entry = { city, notifications: 0, petitions: 0 }
                    acc.push(entry)
                }
                entry.notifications++
            })
            user.petitions.forEach(petition => {
                const city = petition.city.name
                let entry = acc.find(e => e.city === city)
                if (!entry) {
                    entry = { city, notifications: 0, petitions: 0 }
                    acc.push(entry)
                }
                entry.petitions++
            })
            return acc
        }, [] as Array<{ city: string; notifications: number; petitions: number }>)

        const topicPopularity = filteredUsers.reduce((acc, user) => {
            user.notificationPreferences.forEach(pref => {
                pref.interests.forEach(interest => {
                    const topic = interest.name
                    let entry = acc.find(e => e.topic === topic)
                    if (entry) {
                        entry.count++
                    } else {
                        acc.push({ topic, count: 1 })
                    }
                })
            })
            return acc
        }, [] as Array<{ topic: string; count: number }>)

        const totalUsersInPeriod = filteredUsers.length
        const totalUsersOverall = users.length

        return {
            totalUsers: dateRange === 'all' ? totalUsersOverall : totalUsersInPeriod,
            onboardedUsers: filteredUsers.filter(u => u.onboarded).length,
            usersWithNotifications: filteredUsers.filter(u => u.notificationPreferences.length > 0).length,
            usersWithPetitions: filteredUsers.filter(u => u.petitions.length > 0).length,
            growthPercentage,
            registrationTimeline,
            cityDistribution,
            topicPopularity,
            totalUsersOverall
        }
    }, [users, dateRange, aggregateByWeek])

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

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* Registration Timeline */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>Registration Timeline</CardTitle>
                            {(dateRange === 'all' || parseInt(dateRange, 10) >= 30) && (
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="week-toggle"
                                        checked={aggregateByWeek}
                                        onCheckedChange={setAggregateByWeek}
                                    />
                                    <Label htmlFor="week-toggle" className="text-sm">
                                        Aggregate by week
                                    </Label>
                                </div>
                            )}
                        </div>
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