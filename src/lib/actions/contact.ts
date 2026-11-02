"use server";

import { headers } from "next/headers";
import * as z from "zod";
import { sendContactEmail, type ContactFormData } from "@/lib/email/contact";
import { createRateLimiter } from "@/lib/rateLimit";

/**
 * The contact form of the about page. Anyone may submit it, so this is the
 * one Server Action without a session gate: it validates the fields, and it
 * limits how many emails one address and one sender can make the app send.
 */

const contactFormSchema = z.object({
    contactName: z.string().trim().min(1).max(200),
    contactPosition: z.string().trim().min(1).max(200),
    contactEmail: z.email().max(320),
    contactMunicipality: z.string().trim().min(1).max(200),
    contactPhone: z.string().max(40).optional(),
    calculatedPrice: z.number().nonnegative().nullable().optional(),
});

const HOUR = 60 * 60 * 1000;
const perSender = createRateLimiter({ limit: 5, windowMs: HOUR });
const perAddress = createRateLimiter({ limit: 3, windowMs: HOUR });

async function senderKey(): Promise<string> {
    const forwarded = (await headers()).get("x-forwarded-for");
    return forwarded?.split(",")[0]?.trim() || "unknown";
}

export type SubmitContactFormResult = { success: true } | { success: false; message: string };

export async function submitContactForm(input: ContactFormData): Promise<SubmitContactFormResult> {
    const parsed = contactFormSchema.safeParse(input);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return { success: false, message: `${issue.path.join(".")}: ${issue.message}` };
    }
    const data = parsed.data;

    if (!perSender.take(await senderKey()) || !perAddress.take(data.contactEmail.toLowerCase())) {
        return { success: false, message: "Too many requests" };
    }

    const result = await sendContactEmail(data);
    return result.success ? { success: true } : { success: false, message: result.message ?? "Failed to send email" };
}
