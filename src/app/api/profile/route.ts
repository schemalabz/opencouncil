import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { deleteCurrentUser } from "@/lib/db/users";
import { updateUserProfile } from "@/lib/db/userProfile";
import { clearPhone, setAccountPhone } from "@/lib/db/phoneVerification";
import { sendUserOnboardedAdminAlert } from "@/lib/discord";
import { PHONE_IN_USE_CODE } from "@/lib/utils/phone";
import { updateProfileSchema } from "@/lib/zod-schemas/user";
import { errorResponse, handleApiError } from "@/lib/api/errors";

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return errorResponse(401, "Unauthorized");
        }

        const { phone, ...updateData } = updateProfileSchema.parse(await request.json());

        // The number is saved with the rest, in one write, unproved; the
        // reader may prove it with a code later (issue #813). One exception:
        // a number another account typed is not taken without proof, so the
        // rest is saved alone and the form asks for the code. The
        // registration waits with the number: a registered reader lands on
        // the settings, where the code dialog is gone.
        let phoneNeedsCode = false;
        let updatedUser: User;
        if (phone === null) {
            updatedUser = await clearPhone(user.id, updateData);
        } else if (phone === undefined) {
            updatedUser = await updateUserProfile(user.id, updateData);
        } else {
            const outcome = await setAccountPhone(user.id, phone, updateData);
            if (!outcome.ok && outcome.code === PHONE_IN_USE_CODE) {
                return NextResponse.json({ error: { code: PHONE_IN_USE_CODE } }, { status: 409 });
            }
            phoneNeedsCode = !outcome.ok;
            updatedUser = outcome.ok
                ? outcome.user
                : await updateUserProfile(user.id, { ...updateData, onboarded: undefined });
        }

        // Track if this is the user completing onboarding for the first time
        const isCompletingOnboarding = !user.onboarded && updateData.onboarded === true && !phoneNeedsCode;

        // Send Discord admin alert if user just completed onboarding
        if (isCompletingOnboarding) {
            console.log('Sending Discord admin alert for user onboarding');
            sendUserOnboardedAdminAlert({
                cityName: 'General', // No specific city for the profile form
                onboardingSource: 'profile',
                signedInUserId: user.id,
            });
        }

        return NextResponse.json({ ...updatedUser, ...(phoneNeedsCode ? { phoneNeedsCode: true } : {}) });
    } catch (error) {
        return handleApiError(error, "Failed to update profile");
    }
}

export async function DELETE() {
    const user = await getCurrentUser();
    if (!user) {
        return errorResponse(401, "Unauthorized");
    }
    try {
        await deleteCurrentUser();
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return handleApiError(error, "Failed to delete account");
    }
}
