import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/db/prisma"
import { NextResponse } from "next/server"
import { subDays } from "date-fns"

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

        const createdUsers = []
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

            // Create user with persona-specific data
            const userData: any = {
                email,
                name,
                createdAt,
                onboarded: false,
                allowContact: false
            }

            // Apply persona-specific logic
            switch (persona) {
                case 'engaged-citizen':
                userData.onboarded = true
                userData.allowContact = true
                    break
                case 'activist':
                userData.onboarded = true
                userData.allowContact = true
                    break
                case 'lurker':
                userData.onboarded = true
                    userData.allowContact = Math.random() > 0.5 // 50/50 split
                    break
                case 'newcomer':
                default:
                    // Keep defaults (not onboarded, no contact)
                    break
            }

            const newUser = await prisma.user.create({
                data: userData
            })

            console.log("Archetype Seed API - Created user:", newUser.email)

            // Add persona-specific relations with enhanced logic
            if (persona === 'engaged-citizen' && supportedCities.length > 0 && topics.length > 0) {
                // Create notification preferences for 2-4 cities
                const selectedCities = getRandomItems(supportedCities, 2, Math.min(4, supportedCities.length))
                
                for (const city of selectedCities) {
                    // Select 3-6 topics for each city
                    const selectedTopics = getRandomItems(topics, 3, Math.min(6, topics.length))

                await prisma.notificationPreference.create({
                    data: {
                        userId: newUser.id,
                            cityId: city.id,
                        interests: {
                            connect: selectedTopics.map(topic => ({ id: topic.id }))
                        }
                    }
                })
                    totalNotificationPreferences++
                }
                
                console.log("Archetype Seed API - Added", selectedCities.length, "notification preferences for user:", newUser.email)
                
            } else if (persona === 'activist' && unsupportedCities.length > 0) {
                // Create 1-3 petitions for different unsupported cities
                const selectedCities = getRandomItems(unsupportedCities, 1, Math.min(3, unsupportedCities.length))
                
                for (const city of selectedCities) {
                await prisma.petition.create({
                    data: {
                        userId: newUser.id,
                            cityId: city.id,
                            is_resident: Math.random() > 0.3, // 70% chance of being resident
                            is_citizen: Math.random() > 0.3   // 70% chance of being citizen
                    }
                })
                    totalPetitions++
                }
                
                console.log("Archetype Seed API - Added", selectedCities.length, "petitions for user:", newUser.email)
            }

            createdUsers.push(newUser)
        }

        const summary = {
            success: true,
            count: createdUsers.length,
            persona: persona,
            details: {
                users: createdUsers.length,
                notificationPreferences: totalNotificationPreferences,
                petitions: totalPetitions,
                availableCities: cities.length,
                supportedCities: supportedCities.length,
                unsupportedCities: unsupportedCities.length,
                availableTopics: topics.length
            },
            message: `Successfully created ${createdUsers.length} ${persona.replace('-', ' ')} users`
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