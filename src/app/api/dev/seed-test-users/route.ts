import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { TEST_USERS } from '@/lib/dev/test-users'
import { DEV_TOOLS_ALLOWED } from '@/lib/deployment'
import { env } from '@/env.mjs'
import { createUser } from '@/lib/db/users'
import { createLocation } from '@/lib/db/location'
import { getCityCentroid } from '@/lib/db/cities'

const DEV_TEST_CITY_ID = env.DEV_TEST_CITY_ID

export async function POST(request: NextRequest) {
  // Only allow in development or on preview deployments — never on real production
  if (!DEV_TOOLS_ALLOWED) {
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

    // A couple of topics make the test users show up with interests in the
    // notis fanout view and the playground's real-user picker.
    const testTopics = await prisma.topic.findMany({ take: 2, select: { id: true } })

    // Pinned locations near a city's centroid (Athens fallback when the city
    // has no geometry), through the shared src/lib/db helpers so the SQL
    // lives in one place.
    async function ensureLocation(id: string, text: string, cityId: string, offset: number) {
      const centroid = await getCityCentroid(cityId)
      await createLocation({
        id,
        skipIfExists: true,
        text,
        coordinates: [(centroid?.lng ?? 23.7275) + offset, (centroid?.lat ?? 37.9838) + offset]
      })
      return id
    }

    // Every test user gets a fake phone and a phone-enabled notification
    // preference, so the Notis release panel counts them as eligible and the
    // playground can mirror them. Re-runs upgrade users from earlier seeds —
    // including notifyByPhone, which eligibility requires.
    async function ensurePreference(userId: string, cityId: string, locationIds: string[]) {
      const data = {
        notifyByPhone: true,
        interests: { connect: testTopics.map(t => ({ id: t.id })) },
        locations: { connect: locationIds.map(id => ({ id })) }
      }
      await prisma.notificationPreference.upsert({
        where: { userId_cityId: { userId, cityId } },
        update: data,
        create: { userId, cityId, notifyByEmail: true, ...data }
      })
    }

    async function ensureNotisFixtures(userId: string, testUser: (typeof TEST_USERS)[number]) {
      await prisma.user.update({ where: { id: userId }, data: { phone: testUser.phone } })

      // Superadmin and readonly carry pinned locations, so the picker and the
      // seeded profile exercise the locations path; the others stay topic-only.
      const withLocations = testUser.adminType === 'superadmin' || testUser.adminType === 'readonly'
      const locationIds = withLocations
        ? [
            await ensureLocation('ntest-loc-1', 'Κεντρική Πλατεία', DEV_TEST_CITY_ID, 0.003),
            await ensureLocation('ntest-loc-2', 'Δημοτικό Στάδιο', DEV_TEST_CITY_ID, -0.004),
          ]
        : []
      await ensurePreference(userId, DEV_TEST_CITY_ID, locationIds)

      // The superadmin also follows a second municipality, so the multi-city
      // wake path (one shared budget across cities) is testable.
      if (testUser.adminType === 'superadmin') {
        const secondCity = await prisma.city.findFirst({
          where: {
            id: { not: DEV_TEST_CITY_ID },
            councilMeetings: { some: { released: true } }
          },
          select: { id: true }
        })
        if (secondCity) {
          const loc = await ensureLocation('ntest-loc-3', 'Δημαρχείο', secondCity.id, 0.002)
          await ensurePreference(userId, secondCity.id, [loc])
        }
      }
    }

    const createdUsers = []
    const skippedUsers = []

    for (const testUser of TEST_USERS) {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: testUser.email }
      })

      if (existingUser) {
        // Upgrade users from earlier seeds that predate the notis fixtures.
        await ensureNotisFixtures(existingUser.id, testUser)
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

      await ensureNotisFixtures(newUser.id, testUser)

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
  // Only allow in development or on preview deployments — never on real production
  if (!DEV_TOOLS_ALLOWED) {
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