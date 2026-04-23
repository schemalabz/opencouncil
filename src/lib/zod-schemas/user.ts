import { z } from 'zod';

// --- Profile (self-service) ---

const profileFields = {
    name: z.string().trim().min(1, "Name cannot be empty").nullable(),
    phone: z.string().nullable(),
    allowContact: z.boolean(),
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
