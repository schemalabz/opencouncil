"use server";

import { headers } from "next/headers";
import * as z from "zod";
import { env } from "@/env.mjs";
import { sendContactEmail, type ContactFormData } from "@/lib/email/contact";
import { claimAllowance } from "@/lib/rate-limit/limiter";
import { clientIp, hashIdentifier } from "@/lib/rate-limit/rules";

/**
 * The contact form of the about page. Anyone may submit it, so this is the
 * one Server Action without a session gate: it validates the fields, and it
 * limits how many emails the form can make the app send.
 */

const contactFormSchema = z.object({
    contactName: z.string().trim().min(1).max(200),
    contactPosition: z.string().trim().min(1).max(200),
    contactEmail: z.email().max(320),
    contactMunicipality: z.string().trim().min(1).max(200),
    contactPhone: z.string().max(40).optional(),
    calculatedPrice: z.number().nonnegative().nullable().optional(),
});

/**
 * Each submission is one email to the typed address with three staff inboxes
 * in copy. The cap on the client stops a script, the cap on the address keeps
 * one inbox quiet, and the cap on the whole form bounds a distributed run,
 * since nobody submits it sixty times an hour in good faith.
 */
const CONTACT_WINDOW_MS = 60 * 60_000;
const MAX_CONTACT_EMAILS_PER_IP_PER_WINDOW = 5;
const MAX_CONTACT_EMAILS_PER_ADDRESS_PER_WINDOW = 3;
const MAX_CONTACT_EMAILS_PER_WINDOW = 60;

export type SubmitContactFormResult = { success: true } | { success: false; message: string };

export async function submitContactForm(input: ContactFormData): Promise<SubmitContactFormResult> {
    const parsed = contactFormSchema.safeParse(input);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return { success: false, message: `${issue.path.join(".")}: ${issue.message}` };
    }
    const data = parsed.data;

    const ip = clientIp(await headers());
    const claim = await claimAllowance("contact-form", [
        ...(ip
            ? [{ name: "ip", key: `rate-limit:contact-form:ip:${ip}`, max: MAX_CONTACT_EMAILS_PER_IP_PER_WINDOW, windowMs: CONTACT_WINDOW_MS }]
            : []),
        {
            name: "address",
            key: `rate-limit:contact-form:address:${hashIdentifier(env.NEXTAUTH_SECRET, data.contactEmail)}`,
            max: MAX_CONTACT_EMAILS_PER_ADDRESS_PER_WINDOW,
            windowMs: CONTACT_WINDOW_MS,
        },
        { name: "all", key: "rate-limit:contact-form:all", max: MAX_CONTACT_EMAILS_PER_WINDOW, windowMs: CONTACT_WINDOW_MS },
    ]);
    if (!claim.ok) {
        return { success: false, message: "Too many requests" };
    }

    const result = await sendContactEmail(data);
    return result.success ? { success: true } : { success: false, message: result.message ?? "Failed to send email" };
}
