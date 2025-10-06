import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateUserProfile } from "@/lib/db/users";
import { notifyUserOnboarded } from "@/lib/discord";

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const data = await request.json();

        // Remove email if present in data to prevent email updates
        const { email, ...updateData } = data;

        // Track if this is the user completing onboarding for the first time
        const isCompletingOnboarding = !user.onboarded && updateData.onboarded === true;

        const updatedUser = await updateUserProfile(user.id, updateData);

        // Send Discord notification if user just completed onboarding
        if (isCompletingOnboarding) {
            console.log('Sending Discord notification for user onboarding');
            notifyUserOnboarded({
                cityName: 'General', // No specific city for magic link signups
                onboardingSource: 'magic_link',
            });
        }

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error("Failed to update profile:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}