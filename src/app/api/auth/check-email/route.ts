import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

// API route to check if an email exists in the database
export async function GET(request: Request) {
    try {
        // Get the email from the URL query parameters
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email');

        // Validate input
        if (!email) {
            return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
        }

        // Check if the email exists in the database
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true }, // Only select the ID to minimize data exposure
        });

        // Return whether the email exists without exposing any user data
        return NextResponse.json({ exists: !!user }, { status: 200 });

    } catch (error) {
        console.error('Error checking email existence:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 