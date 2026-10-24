import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { TEST_USERS } from '@/lib/dev/test-users'
import { DEV_TOOLS_ALLOWED } from '@/lib/deployment'
import { ensureTestUsers } from '@/lib/db/testUsers'

export async function POST(request: NextRequest) {
  // Only allow in development or on preview deployments — never on real production
  if (!DEV_TOOLS_ALLOWED) {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
  }

  try {
    const users = await ensureTestUsers(prisma)
    return NextResponse.json({
      success: true,
      users,
      message: `Test users ready: ${users.map(u => `${u.email} (${u.administers.length} admin rights)`).join(', ')}`,
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