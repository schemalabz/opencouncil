import "server-only";

import { claimAlertWindow } from "@/lib/cache/alertWindow";
import { sendAdminAlert } from "@/lib/discord-core";
import { REALMS } from "@/lib/realm";
import { detectCountryFromPhone } from "@/lib/utils/phone";
import { SEND_WINDOW_MS } from "./constants";
import { unusualCodeRequest, type UnusualSignal } from "./rules";

/**
 * The operators' view of code requests (issue #813). A code can go to any
 * mobile number in any country, so an unusual request is reported the
 * moment it goes out, with no threshold to tune: abuse shows early.
 */

const HOME_COUNTRIES: readonly string[] = Object.values(REALMS).map((realm) => realm.country);

/** The number with its middle hidden: enough to recognise a flood, not a phone to call. */
function maskPhone(e164: string): string {
    return `${e164.slice(0, 4)}···${e164.slice(-3)}`;
}

/** Never throws: a failed alert must not fail the request that raised it. */
export async function reportUnusualCodeRequest(input: {
    userId: string;
    phone: string;
    /** Codes to this number within the window, this one included. */
    phoneSendCount: number;
}): Promise<void> {
    const country = detectCountryFromPhone(input.phone);
    const found = unusualCodeRequest({ country, phoneSendCount: input.phoneSendCount }, HOME_COUNTRIES);
    // Each signal alerts once per number per window: the fourth code says
    // nothing new after the third, and the thresholds are "at least".
    const signals: UnusualSignal[] = [];
    for (const signal of found) {
        if (await claimAlertWindow(`phone-verification:${signal.kind}:${input.phone}`, SEND_WINDOW_MS / 1000)) {
            signals.push(signal);
        }
    }
    if (signals.length === 0) return;
    try {
        await sendAdminAlert({
            title: "📱 Phone verification: unusual code request",
            description: signals.map((signal) => signal.text).join("\n"),
            color: 0xffa500,
            fields: [
                { name: "Number", value: maskPhone(input.phone), inline: true },
                { name: "Country", value: country ?? "unknown", inline: true },
                { name: "Account", value: input.userId, inline: true },
                { name: "Codes to this number in the last hour", value: String(input.phoneSendCount), inline: true },
            ],
        });
    } catch (error) {
        console.error("Phone verification alert failed:", error);
    }
}
