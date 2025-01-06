import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/db/prisma";

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const data = await request.json();

        // Remove email if present in data to prevent email updates
        const { email, ...updateData } = data;

        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                name: updateData.name,
                phone: updateData.phone,
                allowContact: updateData.allowContact,
                onboarded: updateData.onboarded ?? user.onboarded
            }
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error("Failed to update profile:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}