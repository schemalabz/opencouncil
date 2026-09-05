import { z } from 'zod';
import { PHONE_REJECTION_CODES, normalizeMobilePhone } from '@/lib/utils/phone';

// --- Profile (self-service) ---

/**
 * A phone is stored as a mobile number in E.164 or not at all; the issue
 * message is a code the form translates. A number another account already
 * holds is refused by the route, which needs the database for that.
 */
const phoneField = z
    .string()
    .nullable()
    .transform((value, ctx) => {
        if (value === null) return null;
        const parsed = normalizeMobilePhone(value);
        if (!parsed.ok) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: PHONE_REJECTION_CODES[parsed.reason] });
            return z.NEVER;
        }
        return parsed.e164;
    });

const profileFields = {
    name: z.string().trim().min(1, "Name cannot be empty").nullable(),
    // Null means "no phone"; an empty string is the same thing wearing a
    // different type, and it reads as a phone to every IS NOT NULL query.
    phone: phoneField,
    allowProductUpdates: z.boolean(),
    allowPetitionUpdates: z.boolean(),
    allowFeedbackCalls: z.boolean(),
    onboarded: z.boolean(),
};

export const updateProfileSchema = z.object(profileFields).partial();

export type UpdateProfileData = z.infer<typeof updateProfileSchema>;

// --- Admin user management (superadmin only) ---

const administersEntrySchema = z.object({
    cityId: z.string().nullable().optional(),
    partyId: z.string().nullable().optional(),
    personId: z.string().nullable().optional(),
}).refine(
    data => [data.cityId, data.partyId, data.personId].filter(Boolean).length === 1,
    { message: "Exactly one of cityId, partyId, or personId must be provided" }
);

const adminUserFields = {
    email: z.string().trim().toLowerCase().email("Invalid email address"),
    name: z.string().trim().min(1, "Name cannot be empty").nullable(),
    isSuperAdmin: z.boolean(),
    administers: z.array(administersEntrySchema).optional(),
};

export const createAdminUserSchema = z.object({
    ...adminUserFields,
    email: adminUserFields.email,  // required for create
});

export const updateAdminUserSchema = z.object({
    id: z.string().min(1, "User ID is required"),
    ...adminUserFields,
}).partial().required({ id: true });

export type CreateAdminUserData = z.infer<typeof createAdminUserSchema>;
export type UpdateAdminUserData = z.infer<typeof updateAdminUserSchema>;
