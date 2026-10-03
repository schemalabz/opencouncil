import { env } from '@/env.mjs';

/** A mailbox that OpenCouncil sends email from. */
export type EmailSender = 'auth' | 'notifications' | 'operations' | 'noreply';

/**
 * The `from` address for a sender. `EMAIL_FROM_OVERRIDE` replaces every sender,
 * for a fork or a self-hosted instance whose Resend account cannot send from
 * opencouncil.gr.
 *
 * `auth.config.ts` imports this module and `proxy.ts` reaches that file, so
 * this module must not import server-only code.
 */
export function emailFrom(sender: EmailSender): string {
    return env.EMAIL_FROM_OVERRIDE ?? `OpenCouncil <${sender}@opencouncil.gr>`;
}
