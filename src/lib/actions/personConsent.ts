"use server";

import { setVoicePrintConsent as setVoicePrintConsentInDb } from "@/lib/db/personConsent";

/** Browser-facing wrapper for the profile's consent box; the check lives in the db module. */
export async function setVoicePrintConsent(personId: string, consent: boolean): Promise<void> {
    await setVoicePrintConsentInDb(personId, consent);
}
