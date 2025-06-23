import { getCurrentUser, withUserAuthorizedToEdit } from "@/lib/auth"
import prisma from "@/lib/db/prisma"
import { sendEmail } from "@/lib/email/resend"
import { renderAsync } from "@react-email/render"
import { UserInviteEmail } from "@/lib/email/templates/user-invite"
import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { env } from "@/env.mjs"

async function generateSignInLink(email: string) {
    // Create a token that expires in 24 hours
    const token = createHash('sha256')
        .update(email + Date.now().toString())
        .digest('hex')

    // Save the token in the database
    await prisma.verificationToken.create({
        data: {
            identifier: email,
            token,
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }
    })

    // Generate the sign-in URL
    const signInUrl = `${env.NEXT_PUBLIC_URL}/sign-in?token=${token}&email=${encodeURIComponent(email)}`
    return signInUrl
}

async function sendInviteEmail(email: string, name: string) {
    const signInUrl = await generateSignInLink(email)
    const emailHtml = await renderAsync(UserInviteEmail({
        name: name || email,
        inviteUrl: signInUrl
    }))

    await sendEmail({
        from: "OpenCouncil <auth@opencouncil.gr>",
        to: email,
        subject: "You've been invited to OpenCouncil",
        html: emailHtml,
    })
}

export async function GET() {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const users = await prisma.user.findMany({
            include: {
                administers: {
                    include: {
                        city: true,
                        party: {
                            include: {
                                city: true
                            }
                        },
                        person: {
                            include: {
                                city: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        return NextResponse.json(users)
    } catch (error) {
        console.error("Failed to fetch users:", error)
        return new NextResponse("Failed to fetch users", { status: 500 })
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const data = await request.json()
    const { email, name, isSuperAdmin, administers } = data

    try {
        const newUser = await prisma.user.create({
            data: {
                email,
                name,
                isSuperAdmin,
                administers: {
                    create: administers
                }
            },
            include: {
                administers: {
                    include: {
                        city: true,
                        party: {
                            include: {
                                city: true
                            }
                        },
                        person: {
                            include: {
                                city: true
                            }
                        }
                    }
                }
            }
        })

        // Send invitation email
        await sendInviteEmail(email, name)

        return NextResponse.json(newUser)
    } catch (error) {
        console.error("Failed to create user:", error)
        return new NextResponse("Failed to create user", { status: 500 })
    }
}

export async function PUT(request: Request) {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const data = await request.json()
    const { id, email, name, isSuperAdmin, administers } = data

    try {
        // First delete all existing administers relations
        await prisma.administers.deleteMany({
            where: { userId: id }
        })

        // Then update the user with new data
        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                email,
                name,
                isSuperAdmin,
                administers: {
                    create: administers
                }
            },
            include: {
                administers: {
                    include: {
                        city: true,
                        party: {
                            include: {
                                city: true
                            }
                        },
                        person: {
                            include: {
                                city: true
                            }
                        }
                    }
                }
            }
        })

        return NextResponse.json(updatedUser)
    } catch (error) {
        console.error("Failed to update user:", error)
        return new NextResponse("Failed to update user", { status: 500 })
    }
} 