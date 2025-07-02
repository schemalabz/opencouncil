import { NextRequest, NextResponse } from 'next/server';
import { signIn } from '@/auth';
import prisma from '@/lib/db/prisma';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, email, callbackUrl } = body;

        // Validate required fields
        if (!name?.trim() || !email?.trim() || !callbackUrl) {
            return NextResponse.json(
                { error: 'Name, email, and callback URL are required' },
                { status: 400 }
            );
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: 'Invalid email format' },
                { status: 400 }
            );
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase().trim() }
        });

        if (existingUser) {
            // Update the user's name if they don't have one, or if the new name is different
            if (!existingUser.name || existingUser.name !== name.trim()) {
                await prisma.user.update({
                    where: { id: existingUser.id },
                    data: { 
                        name: name.trim(),
                        onboarded: true // Mark as onboarded since they provided their name
                    }
                });
            }
        } else {
            // Create new user with name
            await prisma.user.create({
                data: {
                    email: email.toLowerCase().trim(),
                    name: name.trim(),
                    onboarded: true, // Mark as onboarded since they provided their name
                    allowContact: false // Default to false, they can change this later
                }
            });
        }

        // Send verification email with callback URL
        // Note: signIn will send an email and redirect to the callbackUrl after verification
        await signIn('resend', 
            { email: email.toLowerCase().trim() }, 
            { redirectTo: callbackUrl }
        );

        return NextResponse.json({ 
            success: true,
            message: 'Verification email sent'
        });

    } catch (error) {
        console.error('Error in register-for-comment:', error);
        
        if (error instanceof Error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to register for comment' },
            { status: 500 }
        );
    }
}