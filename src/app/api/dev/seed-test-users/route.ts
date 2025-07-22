import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { TEST_USERS } from '@/lib/dev/test-users'
import { IS_DEV } from '@/lib/utils'
import { env } from '@/env.mjs'
import { createUser } from '@/lib/db/users'

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
      const newUser = await createUser({
        email: testUser.email,
        name: finalName,
        isSuperAdmin: testUser.isSuperAdmin,
        onboarded: true,
        administers
      }, { skipAuthCheck: true })


      createdUsers.push({
        email: newUser.email,
        name: newUser.name,
        permissions: newUser.administers.map(a => ({
          type: a.cityId ? 'city' : a.partyId ? 'party' : 'person',
          name: a.city?.name || a.party?.name || a.person?.name,
          id: a.cityId || a.partyId || a.personId
        }))
      })
    }

    return NextResponse.json({
      success: true,
      city: testCity.name,
      created: createdUsers,
      skipped: skippedUsers,
      message: `Created ${createdUsers.length} test users for ${testCity.name}, skipped ${skippedUsers.length} existing users`,
      entities: {
        party: testParty?.name || 'No party available',
        person: testPerson?.name || 'No person available'
      }
    })

  } catch (error) {
    console.error('Error creating test users:', error)
    return NextResponse.json({ error: 'Failed to create test users' }, { status: 500 })
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
      },
      select: {
        email: true,
        name: true,
        isSuperAdmin: true
      }
    })

    const allTestUsersExist = testUserEmails.every(email =>
      existingUsers.some(user => user.email === email)
    )

    return NextResponse.json({
      success: true,
      allTestUsersExist,
      existingCount: existingUsers.length,
      totalExpected: testUserEmails.length,
      existingUsers
    })

  } catch (error) {
    console.error('Error checking test users:', error)
    return NextResponse.json({ error: 'Failed to check test users' }, { status: 500 })
  }
} 