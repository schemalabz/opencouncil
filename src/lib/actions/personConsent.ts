"use server";

import {
    recordVoicePrintConsent as recordVoicePrintConsentInDb,
    setVoicePrintConsent as setVoicePrintConsentInDb,
} from "@/lib/db/personConsent";

/** Browser-facing wrapper for the profile's consent box; the check lives in the db module. */
export async function setVoicePrintConsent(personId: string, consent: boolean): Promise<void> {
    await setVoicePrintConsentInDb(personId, consent);
}

/** Browser-facing wrapper for the superadmin control on the person page; the check lives in the db module. */
export async function recordVoicePrintConsent(personId: string, consent: boolean): Promise<void> {
    await recordVoicePrintConsentInDb(personId, consent);
}
