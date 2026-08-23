import { z } from 'zod';

// Input validation for the public onboarding Server Actions
// (saveNotificationPreferences / savePetition in src/lib/db/notifications.ts).
//
// These actions are reachable directly as Server Actions from the onboarding
// client, so their arguments are untrusted. The schemas below validate the
// shape of the known public fields. `.passthrough()` is deliberate: the
// dev-only `seedUser` field is carried through and neutralized separately by
// sanitizeSeedUser() — it must not be stripped here, or the dev seed route
// would lose its seed fields. Privilege escalation via `seedUser` is closed in
// sanitizeSeedUser(), not here; this schema only tightens the client input.

// Shared public fields both onboarding actions accept.
const onboardingBaseFields = {
    cityId: z.string().min(1, "cityId is required"),
    email: z.string().optional(),
    phone: z.string().optional(),
    name: z.string().optional(),
};

export const saveNotificationPreferencesSchema = z
    .object({
        ...onboardingBaseFields,
        // Locations are created server-side inside saveNotificationPreferences
        // (in the preference's transaction), so the client sends their raw
        // data — text + [lng, lat] — not pre-created ids.
        locations: z.array(z.object({
            text: z.string(),
            coordinates: z.tuple([z.number(), z.number()]),
        })),
        topicIds: z.array(z.string()),
    })
    .passthrough();

export const savePetitionSchema = z
    .object({
        ...onboardingBaseFields,
        isResident: z.boolean(),
        isCitizen: z.boolean(),
    })
    .passthrough();
