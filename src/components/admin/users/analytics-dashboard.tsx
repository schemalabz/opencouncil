"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useMemo, useState } from "react"
import { UserWithRelations } from "@/lib/db/users"
import { subDays, format, startOfWeek } from 'date-fns'
import { CityRankingTable } from "./city-ranking-table"

interface AnalyticsDashboardProps {
    users: UserWithRelations[]
}

export function AnalyticsDashboard({ users }: AnalyticsDashboardProps) {
    const [dateRange, setDateRange] = useState("30")
    const [aggregateByWeek, setAggregateByWeek] = useState(false)

    const registrationTimeline = useMemo(() => {
        const dateCutoff = dateRange === 'all' ? null : subDays(new Date(), parseInt(dateRange, 10))

        const filteredUsers = dateCutoff
            ? users.filter(user => new Date(user.createdAt) >= dateCutoff)
            : users

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
    }, [users, dateRange, aggregateByWeek])

    const canAggregateByWeek = dateRange === 'all' || parseInt(dateRange, 10) >= 30

    return (
        <div className="grid gap-4 md:grid-cols-3">
            {/* Registration Timeline */}
            <Card className="md:col-span-2">
                <CardHeader>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <CardTitle>Registration Timeline</CardTitle>
                        <div className="flex items-center gap-4 flex-wrap">
                            {canAggregateByWeek && (
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
                            <Select value={dateRange} onValueChange={setDateRange}>
                                <SelectTrigger className="w-36">
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
                    </div>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={registrationTimeline}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Area type="monotone" dataKey="count" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                        </AreaChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* City Demand */}
            <CityRankingTable users={users} />
        </div>
    )
}
