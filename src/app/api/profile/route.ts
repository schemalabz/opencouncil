import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateUserProfile, deleteCurrentUser } from "@/lib/db/users";
import { clearPhone, setAccountPhone } from "@/lib/db/phoneVerification";
import { sendUserOnboardedAdminAlert } from "@/lib/discord";
import { PHONE_IN_USE_CODE } from "@/lib/utils/phone";
import { updateProfileSchema } from "@/lib/zod-schemas/user";

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const raw = await request.json();
        const parsed = updateProfileSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const { phone, ...updateData } = parsed.data;

        // The number is saved at once, unproved; the reader may prove it
        // with a code later (issue #813). One exception: a number another
        // account typed is not taken without proof, so the rest is saved and
        // the form asks for the code.
        let phoneNeedsCode = false;
        if (phone === null) {
            await clearPhone(user.id);
        } else if (phone !== undefined) {
            const outcome = await setAccountPhone(user.id, phone);
            if (outcome === PHONE_IN_USE_CODE) {
                return NextResponse.json({ error: { code: PHONE_IN_USE_CODE } }, { status: 409 });
            }
            phoneNeedsCode = outcome === "needs_code";
        }

        // Track if this is the user completing onboarding for the first time
        const isCompletingOnboarding = !user.onboarded && updateData.onboarded === true;

        const updatedUser = await updateUserProfile(user.id, updateData);

        // Send Discord admin alert if user just completed onboarding
        if (isCompletingOnboarding) {
            console.log('Sending Discord admin alert for user onboarding');
            sendUserOnboardedAdminAlert({
                cityName: 'General', // No specific city for magic link signups
                onboardingSource: 'magic_link',
            });
        }

        return NextResponse.json({ ...updatedUser, ...(phoneNeedsCode ? { phoneNeedsCode: true } : {}) });
    } catch (error) {
        console.error("Failed to update profile:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export async function DELETE() {
    const user = await getCurrentUser();
    if (!user) {
        return new NextResponse("Unauthorized", { status: 401 });
    }
    try {
        await deleteCurrentUser();
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error("Failed to delete account:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
