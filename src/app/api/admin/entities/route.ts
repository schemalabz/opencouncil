import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/db/prisma"
import { NextResponse } from "next/server"

export async function GET() {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        // Fetch cities
        const cities = await prisma.city.findMany({
            select: {
                id: true,
                name: true
            },
            orderBy: {
                name: 'asc'
            }
        })

        // Fetch parties with their cities
        const parties = await prisma.party.findMany({
            select: {
                id: true,
                name: true,
                city: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        })

        // Fetch people with their cities
        const people = await prisma.person.findMany({
            select: {
                id: true,
                name: true,
                city: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        })

        // Format the response
        const entities = [
            ...cities.map(city => ({
                ...city,
                type: 'city' as const,
                displayName: city.name
            })),
            ...parties.map(party => ({
                ...party,
                type: 'party' as const,
                displayName: `${party.city.name} / ${party.name}`
            })),
            ...people.map(person => ({
                ...person,
                type: 'person' as const,
                displayName: `${person.city.name} / ${person.name}`
            }))
        ]

        return NextResponse.json(entities)
    } catch (error) {
        console.error("Failed to fetch entities:", error)
        return new NextResponse("Failed to fetch entities", { status: 500 })
    }
} 