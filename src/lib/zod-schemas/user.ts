import * as z from 'zod';
import { PHONE_REJECTION_CODES, normalizeMobilePhone } from '@/lib/utils/phone';
import { machineAccountSlug } from '@/lib/auth/machineAccounts';
import { vmsg } from '@/lib/zod-schemas/messages';

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
            ctx.addIssue({ code: 'custom', message: PHONE_REJECTION_CODES[parsed.reason] });
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

// --- Admin user management (superadmin only) ---

const administersEntrySchema = z.object({
    cityId: z.string().nullable().optional(),
    partyId: z.string().nullable().optional(),
    personId: z.string().nullable().optional(),
    administrativeBodyId: z.string().nullable().optional(),
}).refine(
    data => [data.cityId, data.partyId, data.personId, data.administrativeBodyId].filter(Boolean).length === 1,
    { error: "Exactly one of cityId, partyId, personId, or administrativeBodyId must be provided" }
);

const adminUserFields = {
    email: z.string().trim().toLowerCase().pipe(z.email("Invalid email address")),
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

// --- Machine accounts (superadmin only) ---

/**
 * The label of a machine account: its display name, and the source of its
 * address (machineAccountSlug), so it needs a Latin letter or a digit.
 */
export const machineAccountLabelSchema = z.string().trim()
    .min(1, { error: vmsg('machineAccountLabelInvalid') })
    .max(100, { error: vmsg('machineAccountLabelInvalid') })
    .refine((label) => machineAccountSlug(label) !== null, { error: vmsg('machineAccountLabelInvalid') });

/** JSON body of POST /api/admin/users when it creates a machine account. */
export const createMachineAccountSchema = z.object({
    isMachine: z.literal(true),
    label: machineAccountLabelSchema,
    isSuperAdmin: adminUserFields.isSuperAdmin,
    administers: adminUserFields.administers,
});
export type CreateMachineAccountInput = z.infer<typeof createMachineAccountSchema>;

/**
 * JSON body of POST /api/admin/users: a machine account when `isMachine` is
 * true, a person otherwise. One schema for the route and its OpenAPI entry,
 * so a body like `isMachine: "true"` is refused, not read as a person.
 */
export const createUserRequestSchema = z.discriminatedUnion('isMachine', [
    createMachineAccountSchema,
    createAdminUserSchema.extend({ isMachine: z.literal(false).optional() }),
]);

/** An id a Server Action receives: any JSON value until it is checked. */
export const entityIdSchema = z.string().min(1);

// --- Admins of an administrative body ---

// JSON body of POST /api/cities/{cityId}/administrative-bodies/{bodyId}/admins
export const addBodyAdminRequestSchema = z.object({
    email: adminUserFields.email,
    name: z.string().trim().min(1).nullable().optional(),
});

// JSON body of DELETE /api/cities/{cityId}/administrative-bodies/{bodyId}/admins
export const removeBodyAdminRequestSchema = z.object({
    userId: z.string().min(1),
});
