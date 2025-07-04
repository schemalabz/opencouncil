import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/db/prisma"
import { NextResponse } from "next/server"
import { format, subDays, startOfDay, endOfDay } from "date-fns"

export async function GET(request: Request) {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const { searchParams } = new URL(request.url)
        const dateRange = searchParams.get('dateRange') || '30'
        
        const days = dateRange === 'all' ? 365 : parseInt(dateRange)
        const startDate = days === 365 ? new Date(0) : subDays(new Date(), days)

        // Get total users and basic stats
        const totalUsers = await prisma.user.count()
        const onboardedUsers = await prisma.user.count({ where: { onboarded: true } })
        const usersWithNotifications = await prisma.user.count({
            where: {
                notificationPreferences: { some: {} }
            }
        })
        const usersWithPetitions = await prisma.user.count({
            where: {
                petitions: { some: {} }
            }
        })

        // Get new users this week and month
        const weekAgo = subDays(new Date(), 7)
        const monthAgo = subDays(new Date(), 30)
        
        const newUsersThisWeek = await prisma.user.count({
            where: {
                createdAt: { gte: weekAgo }
            }
        })
        
        const newUsersThisMonth = await prisma.user.count({
            where: {
                createdAt: { gte: monthAgo }
            }
        })

        // Calculate growth percentage (comparing current period to previous period)
        const previousPeriodStart = subDays(startDate, days)
        const currentPeriodUsers = await prisma.user.count({
            where: {
                createdAt: { gte: startDate }
            }
        })
        const previousPeriodUsers = await prisma.user.count({
            where: {
                createdAt: { gte: previousPeriodStart, lt: startDate }
            }
        })
        
        const growthPercentage = previousPeriodUsers > 0 
            ? ((currentPeriodUsers - previousPeriodUsers) / previousPeriodUsers) * 100 
            : 0

        // Generate registration timeline data
        const timelineData = []
        for (let i = days - 1; i >= 0; i--) {
            const date = subDays(new Date(), i)
            const dayStart = startOfDay(date)
            const dayEnd = endOfDay(date)
            
            const count = await prisma.user.count({
                where: {
                    createdAt: {
                        gte: dayStart,
                        lte: dayEnd
                    }
                }
            })
            
            timelineData.push({
                date: format(date, 'MMM dd'),
                count
            })
        }

        // Get city distribution data
        const cities = await prisma.city.findMany({
            where: {
                OR: [
                    { notificationPreferences: { some: {} } },
                    { petitions: { some: {} } }
                ]
            },
            include: {
                notificationPreferences: true,
                petitions: true
            }
        })

        const cityData = cities
            .map(city => ({
                city: city.name,
                notifications: city.notificationPreferences.length,
                petitions: city.petitions.length
            }))
            .sort((a, b) => b.notifications - a.notifications)
            .slice(0, 10)

        // Get topic popularity data
        const preferencesWithTopics = await prisma.notificationPreference.findMany({
            where: {
                user: {
                    createdAt: { gte: startDate }
                }
            },
            include: {
                interests: true // This is the relation to Topic model
            }
        })

        const topicCounts = new Map<string, number>()
        preferencesWithTopics.forEach(pref => {
            pref.interests.forEach(topic => {
                topicCounts.set(topic.name, (topicCounts.get(topic.name) || 0) + 1)
            })
        })
        
        const topicData = Array.from(topicCounts.entries())
            .map(([topic, count]) => ({ topic, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8)

        return NextResponse.json({
            totalUsers,
            onboardedUsers,
            usersWithNotifications,
            usersWithPetitions,
            newUsersThisWeek,
            newUsersThisMonth,
            growthPercentage,
            registrationTimeline: timelineData,
            cityDistribution: cityData,
            topicPopularity: topicData
        })
    } catch (error) {
        console.error("Failed to fetch analytics:", error)
        return new NextResponse("Failed to fetch analytics", { status: 500 })
    }
} 