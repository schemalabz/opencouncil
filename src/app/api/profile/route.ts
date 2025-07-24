import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateUserProfile } from "@/lib/db/users";

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const data = await request.json();

        // Remove email if present in data to prevent email updates
        const { email, ...updateData } = data;

        const updatedUser = await updateUserProfile(user.id, updateData);

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error("Failed to update profile:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}