import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { TEST_USERS } from '@/lib/dev/test-users'
import { IS_DEV } from '@/lib/utils'
import { env } from '@/env.mjs'

const DEV_TEST_CITY_ID = env.DEV_TEST_CITY_ID

export async function POST(request: NextRequest) {
  // Only allow in development environment
  if (!IS_DEV) {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
  }

  try {
    // Verify test city exists
    const testCity = await prisma.city.findUnique({
      where: { id: DEV_TEST_CITY_ID },
      select: { id: true, name: true }
    })

    if (!testCity) {
      return NextResponse.json({ 
        error: `City with id "${DEV_TEST_CITY_ID}" not found. Please ensure your database is seeded with city data.` 
      }, { status: 404 })
    }

    // Get one party and one person from test city for specific admin users
    const testParty = await prisma.party.findFirst({
      where: { cityId: DEV_TEST_CITY_ID },
      select: { id: true, name: true }
    })

    const testPerson = await prisma.person.findFirst({
      where: { cityId: DEV_TEST_CITY_ID },
      select: { id: true, name: true }
    })

    const createdUsers = []
    const skippedUsers = []

    for (const testUser of TEST_USERS) {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: testUser.email }
      })

      if (existingUser) {
        skippedUsers.push({
          email: testUser.email,
          name: testUser.name,
          reason: 'Already exists'
        })
        continue
      }

      // Determine user name and permissions based on admin type
      let finalName: string = testUser.name
      let administers: any[] = []

      switch (testUser.adminType) {
        case 'superadmin':
          // Super admin needs no additional permissions
          break
        case 'city':
          finalName = `${testCity.name.charAt(0).toUpperCase() + testCity.name.slice(1)} Admin (${testCity.name})`
          administers = [{ cityId: testCity.id }]
          break
        case 'party':
          if (testParty) {
            finalName = `Party Admin (${testParty.name})`
            administers = [{ partyId: testParty.id }]
          } else {
            finalName = 'Party Admin (No party available)'
          }
          break
        case 'person':
          if (testPerson) {
            finalName = `Person Admin (${testPerson.name})`
            administers = [{ personId: testPerson.id }]
          } else {
            finalName = 'Person Admin (No person available)'
          }
          break
        case 'readonly':
          // Read-only user has no administers
          break
      }

      // Create user with administers relationship
      const newUser = await prisma.user.create({
        data: {
          email: testUser.email,
          name: finalName,
          isSuperAdmin: testUser.isSuperAdmin,
          onboarded: true,
          administers: {
            create: administers
          }
        },
        include: {
          administers: {
            include: {
              city: true,
              party: true,
              person: true
            }
          }
        }

        // Check if all test users from test-users.ts exist
        const testUserEmails = TEST_USERS.map(user => user.email)
        const existingUsers = await prisma.user.findMany({
            where: {
                email: {
                    in: testUserEmails
                }
            },
            select: { email: true }
        })

        const existingEmails = existingUsers.map(user => user.email)
        const allTestUsersExist = testUserEmails.every(email => existingEmails.includes(email))

        return NextResponse.json({
            allTestUsersExist,
            existingCount: existingUsers.length,
            totalCount: testUserEmails.length,
            missingUsers: testUserEmails.filter(email => !existingEmails.includes(email))
        })

    } catch (error) {
        console.error("Seed API - GET Error:", error)
        return new NextResponse(`Failed to check test users: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 })
    }
}

// Add a GET endpoint to check if test users exist
export async function GET(request: NextRequest) {
  // Only allow in development environment
  if (!IS_DEV) {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
  }

  try {
    const testUserEmails = TEST_USERS.map(user => user.email)
    
    const existingUsers = await prisma.user.findMany({
      where: {
        email: {
          in: testUserEmails
        }

        console.log("Seed API - Creating original test users for city:", DEV_TEST_CITY_ID)

        // Verify the test city exists
        const testCity = await prisma.city.findUnique({
            where: { id: DEV_TEST_CITY_ID },
            select: { id: true, name: true }
        })

        if (!testCity) {
            return new NextResponse(`Test city with id "${DEV_TEST_CITY_ID}" not found`, { status: 400 })
        }

        // Get one party and one person from the test city for specific admin users
        const testParty = await prisma.party.findFirst({
            where: { cityId: DEV_TEST_CITY_ID },
            select: { id: true, name: true }
        })

        const testPerson = await prisma.person.findFirst({
            where: { cityId: DEV_TEST_CITY_ID },
            select: { id: true, name: true }
        })

        const createdUsers = []

        for (const testUser of TEST_USERS) {
            // Check if user already exists
            const existingUser = await prisma.user.findUnique({
                where: { email: testUser.email }
            })

            if (existingUser) {
                console.log(`Test user with email ${testUser.email} already exists`)
                continue
            }

            // Determine user name and permissions based on admin type
            let finalName: string = testUser.name
            let administers: any[] = []

            switch (testUser.adminType) {
                case 'superadmin':
                    // Super admin needs no additional permissions
                    break
                case 'city':
                    administers = [{ cityId: testCity.id }]
                    break
                case 'party':
                    if (testParty) {
                        finalName = `Party Admin (${testParty.name})`
                        administers = [{ partyId: testParty.id }]
                    } else {
                        finalName = 'Party Admin (No party available)'
                    }
                    break
                case 'person':
                    if (testPerson) {
                        finalName = `Person Admin (${testPerson.name})`
                        administers = [{ personId: testPerson.id }]
                    } else {
                        finalName = 'Person Admin (No person available)'
                    }
                    break
                case 'readonly':
                    // Read-only user has no administers
                    break
            }

            // Create test user
            const newUser = await prisma.user.create({
                data: {
                    email: testUser.email,
                    name: finalName,
                    isSuperAdmin: testUser.isSuperAdmin,
                    onboarded: true,
                    administers: {
                        create: administers
                    }
                }
            })

            console.log(`Created test user: ${finalName} (${testUser.email})`)
            createdUsers.push(newUser)
        }

        console.log("Seed API - Successfully created", createdUsers.length, "original test users")

        return NextResponse.json({
            success: true,
            count: createdUsers.length,
            message: `Successfully created ${createdUsers.length} original test users`
        })

    } catch (error) {
        console.error("Seed API - Error creating original test users:", error)
        return new NextResponse(`Failed to create original test users: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 })
    }
} 