import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { PrismaAdapter } from "@auth/prisma-adapter"

export async function POST(request: NextRequest) {
  // Only allow in development environment
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
  }

  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Check if user exists in database
    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Create a session using Prisma adapter (the working approach)
    const adapter = PrismaAdapter(prisma)
    
    // Create session token
    const sessionToken = crypto.randomUUID()
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

    // Create session in database using the adapter
    if (adapter.createSession) {
      await adapter.createSession({
        sessionToken,
        userId: user.id,
        expires
      })
    }

    // Set the session cookie with the same name Next-Auth uses
    const isProduction = (process.env.NODE_ENV as string) === 'production'
    const cookieName = isProduction
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token'

    const response = NextResponse.json({ 
      success: true, 
      user: { email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin } 
    })

    // Set the session cookie
    response.cookies.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Quick login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
} 