import * as z from 'zod';
import type { User } from '@prisma/client';

// Input validation for the public onboarding Server Actions
// (saveNotificationPreferences / savePetition in src/lib/db/notifications.ts).
// The actions take z.input of these schemas and use the parsed output.
//
// These actions are reachable directly as Server Actions from the onboarding
// client, so their arguments are untrusted. The schemas below validate the
// shape of the known public fields.

// Shared public fields both onboarding actions accept.
const onboardingBaseFields = {
    cityId: z.string().min(1, "cityId is required"),
    email: z.string().optional(),
    phone: z.string().optional(),
    name: z.string().optional(),
    // Where the sign-in link should land when the email already has an
    // account: the page the reader is filling in. Validated again server-side
    // by safeRedirectPath — a relative path only, never another origin.
    returnTo: z.string().max(512).optional(),
    // Dev-seed-only convenience: lets the seed-users API create users without
    // a session and without a magic link. It is carried through unvalidated,
    // so it is attacker-controllable. sanitizeSeedUser() neutralizes it: it
    // returns undefined off local dev and otherwise keeps only benign fields,
    // never isSuperAdmin or identity fields. Never spread the raw value.
    seedUser: z.custom<Partial<User>>().optional(),
};

export const saveNotificationPreferencesSchema = z.object({
    ...onboardingBaseFields,
    // Locations are created server-side inside saveNotificationPreferences
    // (in the preference's transaction), so the client sends their raw
    // data — text + [lng, lat] — not pre-created ids.
    locations: z.array(z.object({
        text: z.string(),
        coordinates: z.tuple([z.number(), z.number()]),
    })),
    topicIds: z.array(z.string()),
    // Channel consent, as the signup's delivery step records it. Optional
    // so older callers (the dev seed route) keep the schema defaults; the
    // signup flow always sends both.
    notifyByPhone: z.boolean().optional(),
    notifyByEmail: z.boolean().optional(),
});

export const savePetitionSchema = z.object({
    ...onboardingBaseFields,
    isResident: z.boolean(),
    isCitizen: z.boolean(),
    // The reader's own words for a third relation; null clears it.
    otherRelation: z.string().trim().max(120).nullable().optional(),
});
