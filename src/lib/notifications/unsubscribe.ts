import prisma from '@/lib/db/prisma';
import type { User } from '@prisma/client';
import { aiChat } from '@/lib/ai';
import { sendConversationMessage } from '@/lib/notifications/bird';
import { sendAndPersistOutbound } from '@/lib/notifications/outbound';

function stripDiacritics(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Keyword gate before we run the LLM verifier. The regex catches widely on
// purpose — `verifyUnsubscribeIntent` does the precise filtering — but it's
// intentionally NOT semantic: messages like "δεν θέλω άλλα μηνύματα" (clear
// opt-out intent, no keyword) won't reach the LLM. Running Claude on every
// inbound message would add cost and latency for what's overwhelmingly
// noise, so we accept that purely-semantic opt-outs slip through and rely
// on the explicit unsubscribe link in every notification as the alternative.
//
// `απεγγρα[φψ]` covers both Greek conjugation stems for "unsubscribe":
//   - φ form: noun `απεγγραφή`, past `απεγγράφτηκα`
//   - ψ form: imperative `απεγγράψτε`, aorist `απεγγράψω`
// Greek shifts φ→ψ in the aorist consonant cluster.
export const UNSUBSCRIBE_KEYWORDS_RE =
    /(?:\bSTOP\b|\bunsubscribe\b|ΣΤΟΠ|διακοπη|απεγγρα[φψ])/iu;

export function isUnsubscribeMessage(body: string | null | undefined): boolean {
    if (!body) return false;
    return UNSUBSCRIBE_KEYWORDS_RE.test(stripDiacritics(body));
}

const UNSUBSCRIBE_VERIFICATION_PROMPT = `Είσαι ένας ταξινομητής πρόθεσης απεγγραφής για το OpenCouncil.

Δίνεται ένα εισερχόμενο μήνυμα από χρήστη μέσω WhatsApp/SMS. Πρέπει να κρίνεις αν ο χρήστης ζητάει ξεκάθαρα να σταματήσει να λαμβάνει ειδοποιήσεις από την υπηρεσία μας (απεγγραφή από όλα).

Επιστρέφεις ΜΟΝΟ ένα JSON αντικείμενο με τη δομή:
{
    "unsubscribe": boolean,
    "reasoning": string
}

Κανόνες:
1. "unsubscribe": true ΜΟΝΟ όταν ο χρήστης δηλώνει σαφή, ενεργή πρόθεση να σταματήσει ΤΩΡΑ τις ειδοποιήσεις. Παραδείγματα: "STOP", "ΣΤΟΠ", "unsubscribe", "διακοπή", "απεγγραφή", "Απεγγραφή τώρα", "Απεγγράψτε με", "δεν θέλω άλλα μηνύματα", "stop sending me messages".

2. "unsubscribe": false όταν η ίδια λέξη εμφανίζεται σε άλλο πλαίσιο. Συγκεκριμένα, απόρριψε όταν:
   - Η λέξη χρησιμοποιείται ως ΟΥΣΙΑΣΤΙΚΟ ή αντικείμενο, όχι ως αίτημα. Π.χ. "Το στοπ δίπλα από το σπίτι μου έχει πέσει" (αναφορά σε πινακίδα οδικής σήμανσης).
   - Ο χρήστης ΑΦΗΓΕΙΤΑΙ ή ΣΧΟΛΙΑΖΕΙ μια προηγούμενη/μελλοντική απεγγραφή χωρίς να τη ζητάει τώρα. Π.χ. "Απεγγράφτηκα προχτές και θέλω να ξαναεγγραφώ" (αφήγηση παρελθόντος + αίτημα εγγραφής, όχι απεγγραφής).
   - Άλλη χρήση της λέξης. Π.χ. "θα stop περάσω αύριο", "stop the meeting".
   - Σχόλιο/ερώτηση για συγκεκριμένη συνεδρίαση ή θέμα.

3. Σε αμφιβολία, επέλεξε false. Είναι προτιμότερο να μην απεγγραφεί παρά να απεγγραφεί λάθος.

4. "reasoning": μια σύντομη πρόταση (≤ 20 λέξεις) με την αιτιολόγησή σου.`;

interface UnsubscribeVerificationResult {
    unsubscribe: boolean;
    reasoning?: string;
}

/**
 * Three-state result so callers can distinguish a deliberate "no" from a
 * transient LLM outage. `failed` lets the webhook reply with a "try again
 * later" message instead of silently dropping a valid STOP.
 */
export type UnsubscribeIntent = 'confirmed' | 'rejected' | 'failed';

export async function verifyUnsubscribeIntent(body: string): Promise<UnsubscribeIntent> {
    try {
        const { result } = await aiChat<UnsubscribeVerificationResult>(
            UNSUBSCRIBE_VERIFICATION_PROMPT,
            body,
            undefined,
            undefined,
            { maxTokens: 200, model: 'claude-haiku-4-5-20251001' },
        );
        return result.unsubscribe === true ? 'confirmed' : 'rejected';
    } catch (error) {
        console.error('verifyUnsubscribeIntent failed:', error);
        return 'failed';
    }
}

export async function findUserByNotificationDeliveryId(
    notificationDeliveryId: string,
): Promise<User | null> {
    const delivery = await prisma.notificationDelivery.findUnique({
        where: { id: notificationDeliveryId },
        include: { notification: { include: { user: true } } },
    });
    return delivery?.notification?.user ?? null;
}

/**
 * Disables phone notifications across all cities for this user.
 * Returns the number of rows actually changed — `0` means the user was
 * already fully unsubscribed.
 */
export async function unsubscribeUserPhoneFromAllCities(
    userId: string,
): Promise<{ changedCount: number }> {
    const result = await prisma.notificationPreference.updateMany({
        where: { userId, notifyByPhone: true },
        data: { notifyByPhone: false },
    });
    return { changedCount: result.count };
}

export const UNSUBSCRIBE_CONFIRMATION_TEXT =
    'Δεν θα λαμβάνετε πλέον ειδοποιήσεις μέσω τηλεφώνου. Για να τις ενεργοποιήσετε ξανά, συνδεθείτε στο opencouncil.gr/profile?tab=notifications';

// Used when a STOP arrives but no preference rows actually changed — phrased
// as "you don't receive..." rather than "you've been unsubscribed..." so it
// reads correctly for users who were never opted in.
export const UNSUBSCRIBE_ALREADY_TEXT =
    'Δεν λαμβάνετε ειδοποιήσεις μέσω τηλεφώνου. Για να τις ενεργοποιήσετε ξανά, συνδεθείτε στο opencouncil.gr/profile?tab=notifications';

export const UNSUBSCRIBE_RETRY_TEXT =
    'Παρουσιάστηκε προσωρινό πρόβλημα, παρακαλούμε δοκιμάστε ξανά σε λίγο.';

export async function sendUnsubscribeReply(input: {
    conversationId: string;
    phone: string;
    notificationDeliveryId: string | null;
    text: string;
}): Promise<void> {
    // `reconcile: false` — the inbound webhook will reconcile this row
    // when Bird emits the delivery-status event, so the synchronous poll
    // would be redundant.
    await sendAndPersistOutbound({
        channel: 'whatsapp',
        phone: input.phone,
        body: input.text,
        conversationId: input.conversationId,
        notificationDeliveryId: input.notificationDeliveryId,
        send: () => sendConversationMessage({
            conversationId: input.conversationId,
            channel: 'whatsapp',
            text: input.text,
            recipientPhone: input.phone,
        }),
        reconcile: false,
    });
}
