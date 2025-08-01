import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/db/prisma"
import { NextResponse } from "next/server"
import { subDays } from "date-fns"
import { IS_DEV } from '@/lib/utils'
import { saveNotificationPreferences, savePetition } from "@/lib/db/notifications"

interface SeedRequest {
    persona: string
    quantity?: number
    dateRange?: number
}

// Helper function to get random items from array
function getRandomItems<T>(array: T[], min: number, max: number): T[] {
    const count = Math.floor(Math.random() * (max - min + 1)) + min
    const shuffled = [...array].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, Math.min(count, array.length))
}

export async function POST(request: Request) {
    // Only allow in development environment
    if (!IS_DEV) {
        return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
    }
    try {
        const user = await getCurrentUser()
        console.log("Archetype Seed API - User check:", user ? { id: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin } : "No user")
        
        if (!user) {
            console.log("Archetype Seed API - No user found")
            return new NextResponse("No user session found", { status: 401 })
        }
        
        if (!user.isSuperAdmin) {
            console.log("Archetype Seed API - User is not super admin")
            return new NextResponse("User is not a super admin", { status: 403 })
        }

        const body: SeedRequest = await request.json()
        console.log("Archetype Seed API - Request body:", body)
        
        const { persona, quantity = 10, dateRange = 30 } = body

        // Validate persona
        const validPersonas = ['engaged-citizen', 'activist', 'newcomer', 'lurker']
        if (!validPersonas.includes(persona)) {
            return new NextResponse(`Invalid persona. Must be one of: ${validPersonas.join(', ')}`, { status: 400 })
        }

        // Validate quantity
        if (quantity < 1 || quantity > 50) {
            return new NextResponse("Quantity must be between 1 and 50", { status: 400 })
        }

        // Get available cities and topics for seeding
        const cities = await prisma.city.findMany({
            where: { isListed: true },
            orderBy: { name: 'asc' }
        })

        const topics = await prisma.topic.findMany({
            orderBy: { name: 'asc' }
        })

        console.log("Archetype Seed API - Found cities:", cities.length, "topics:", topics.length)

        const supportedCities = cities.filter(city => city.supportsNotifications)
        const unsupportedCities = cities.filter(city => !city.supportsNotifications)

        // Enhanced validation based on persona requirements
        if (cities.length === 0) {
            return new NextResponse("No cities available for seeding", { status: 400 })
        }

        if (persona === 'engaged-citizen' && supportedCities.length === 0) {
            return new NextResponse("No supported cities available for engaged citizens (need cities with supportsNotifications=true)", { status: 400 })
        }

        if (persona === 'activist' && unsupportedCities.length === 0) {
            return new NextResponse("No unsupported cities available for activists (need cities with supportsNotifications=false)", { status: 400 })
        }

        if ((persona === 'engaged-citizen') && topics.length < 3) {
            return new NextResponse("Not enough topics available for engaged citizens (need at least 3 topics)", { status: 400 })
        }

        let totalCreatedUsers = 0
        let totalNotificationPreferences = 0
        let totalPetitions = 0

        for (let i = 0; i < quantity; i++) {
            const timestamp = Date.now() + i // Ensure unique emails
            const email = `${persona}-${timestamp}@test.com`
            const personaName = persona.split('-').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ')
            const name = `${personaName} User ${i + 1}`
            
            // Generate registration date based on persona behavior
            let daysAgo: number
            if (persona === 'newcomer') {
                // Newcomers tend to be more recent (bias toward recent dates)
                daysAgo = Math.floor(Math.random() * Math.min(dateRange / 2, 14))
            } else {
                // Other personas spread across full range
                daysAgo = Math.floor(Math.random() * dateRange)
            }
            const createdAt = subDays(new Date(), daysAgo)

            const userData: any = {
                createdAt,
                onboarded: persona === 'engaged-citizen' || persona === 'activist' || persona === 'lurker',
                allowContact: persona === 'engaged-citizen' || persona === 'activist' || (persona === 'lurker' && Math.random() > 0.5),
            }
            
            // Add persona-specific relations with enhanced logic
            if (persona === 'engaged-citizen' && supportedCities.length > 0 && topics.length > 0) {
                // Create notification preferences for 1 city
                const selectedCity = getRandomItems(supportedCities, 1, 1)[0]
                
                if (selectedCity) {
                    const selectedTopics = getRandomItems(topics, 3, Math.min(6, topics.length))
                    const result = await saveNotificationPreferences({
                        email,
                        name,
                        cityId: selectedCity.id,
                        topicIds: selectedTopics.map(t => t.id),
                        locationIds: [],
                        seedUser: userData
                    })

                    if (result.success) {
                        totalNotificationPreferences++
                    } else {
                        console.error("Failed to save notification preference for seed user:", result.error)
                    }
                }
            } else if (persona === 'activist' && unsupportedCities.length > 0) {
                // Create 1 petition for one unsupported city
                const selectedCity = getRandomItems(unsupportedCities, 1, 1)[0]
                
                if (selectedCity) {
                    const result = await savePetition({
                        email,
                        name,
                        cityId: selectedCity.id,
                        isResident: Math.random() > 0.3,
                        isCitizen: Math.random() > 0.3,
                        seedUser: userData
                    })

                    if (result.success) {
                        totalPetitions++
                    } else {
                        console.error("Failed to save petition for seed user:", result.error)
                    }
                }
            }
            
            totalCreatedUsers++
        }

        const summary = {
            success: true,
            count: totalCreatedUsers,
            persona: persona,
            details: {
                users: totalCreatedUsers,
                notificationPreferences: totalNotificationPreferences,
                petitions: totalPetitions,
                availableCities: cities.length,
                supportedCities: supportedCities.length,
                unsupportedCities: unsupportedCities.length,
                availableTopics: topics.length
            },
            message: `Successfully created ${totalCreatedUsers} ${persona.replace('-', ' ')} users`
        }

        if (totalNotificationPreferences > 0) {
            summary.message += ` with ${totalNotificationPreferences} notification preferences`
        }
        if (totalPetitions > 0) {
            summary.message += ` with ${totalPetitions} petitions`
        }

        console.log("Archetype Seed API - Summary:", summary)

        return NextResponse.json(summary)

    } catch (error) {
        console.error("Archetype Seed API - Error:", error)
        return new NextResponse(`Failed to seed archetype users: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 })
    }
} 