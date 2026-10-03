import "server-only";

import { Prisma, type PhoneVerification } from "@prisma/client";
import { env } from "@/env.mjs";
import prisma from "@/lib/db/prisma";
import { phoneBelongsToAnotherUser, phoneVerifiedByAnotherUser } from "@/lib/db/users";
import { DEV_TOOLS_ALLOWED } from "@/lib/deployment";
import { CODE_TTL_MS, MAX_ATTEMPTS, SEND_WINDOW_MS } from "@/lib/phone-verification/constants";
import { codeMatches, generateCode, hashCode, isExpired, sendAllowance } from "@/lib/phone-verification/rules";
import { isSmsConfigured, sendVerificationSms, type VerificationLocale } from "@/lib/phone-verification/sms";
import { PHONE_IN_USE_CODE, PHONE_REJECTION_CODES, normalizeMobilePhone } from "@/lib/utils/phone";

/**
 * A reader can prove that they own their mobile number with a code (issue
 * #813). Verification is optional: a number is saved on the account at once
 * and Νότης writes to it as before. What the proof buys: a proved number
 * cannot be claimed by another account, and it takes the place of an
 * unproved claim. PhoneVerification holds the number being proved and the
 * hash of its code; a match sets User.phoneVerifiedAt.
 *
 * The code goes out as one SMS, straight to Bird's SMS channel
 * (src/lib/phone-verification/sms.ts). Without the Bird values, a
 * development or preview deployment prints the code to the server log
 * instead, so the flow can be walked through; production refuses.
 *
 * Every limit holds under concurrency: a send is reserved in PhoneCodeSend
 * under a lock on the number and the account before it goes out, and a
 * wrong-code attempt is claimed atomically before the code is compared.
 */

export type { VerificationLocale };

/** Where a code went: a real SMS, or the server log that stands in for it in development. */
export type CodeChannel = "sms" | "log";

export interface PhoneVerificationState {
    /** The account's number, verified or not. */
    phone: string | null;
    phoneVerified: boolean;
    /** The number waiting for a code, when there is one. */
    pendingPhone: string | null;
}

export async function getPhoneVerificationState(userId: string): Promise<PhoneVerificationState> {
    const [user, pendingPhone] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { phone: true, phoneVerifiedAt: true } }),
        getPendingPhone(userId),
    ]);
    return { phone: user?.phone ?? null, phoneVerified: Boolean(user?.phoneVerifiedAt), pendingPhone };
}

export async function getPendingPhone(userId: string): Promise<string | null> {
    const pending = await prisma.phoneVerification.findUnique({ where: { userId }, select: { phone: true } });
    return pending?.phone ?? null;
}

export type StageResult =
    | { ok: true; pending: PhoneVerification }
    | { ok: false; code: "already_verified" | typeof PHONE_IN_USE_CODE };

/**
 * Put a number on the reader's account as the one awaiting a code. The
 * reader's own verified number needs no code: staging it clears any pending
 * attempt. A new number replaces a pending one and its code. The send limits
 * live in PhoneCodeSend, not here, so a switch of numbers resets none of
 * them. `phone` must already be in E.164.
 */
export async function stagePhone(userId: string, phone: string): Promise<StageResult> {
    const [user, pending] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { phone: true, phoneVerifiedAt: true } }),
        prisma.phoneVerification.findUnique({ where: { userId } }),
    ]);
    if (user?.phone === phone && user.phoneVerifiedAt) {
        if (pending) await prisma.phoneVerification.deleteMany({ where: { userId } });
        return { ok: false, code: "already_verified" };
    }
    if (await phoneVerifiedByAnotherUser(phone, userId)) return { ok: false, code: PHONE_IN_USE_CODE };
    if (pending?.phone === phone) return { ok: true, pending };
    const staged = await prisma.phoneVerification.upsert({
        where: { userId },
        create: { userId, phone },
        update: { phone, codeHash: null, expiresAt: null, attempts: 0 },
    });
    return { ok: true, pending: staged };
}

export type SetPhoneResult = "saved" | "needs_code" | typeof PHONE_IN_USE_CODE;

/**
 * Save a number on the account, unproved, as the profile and the signups
 * always did. One number is one account: a number another account proved is
 * refused. A number another account only typed is not taken without proof —
 * the caller asks for the code, and the confirmation moves it. A code that
 * waits for a different number is dropped: the reader chose this one.
 * `phone` must already be in E.164.
 */
export async function setAccountPhone(userId: string, phone: string): Promise<SetPhoneResult> {
    const heldByAnother = async (): Promise<SetPhoneResult | null> => {
        if (await phoneVerifiedByAnotherUser(phone, userId)) return PHONE_IN_USE_CODE;
        if (await phoneBelongsToAnotherUser(phone, userId)) return "needs_code";
        return null;
    };
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
    const stalePending = prisma.phoneVerification.deleteMany({ where: { userId, NOT: { phone } } });
    if (user?.phone === phone) {
        await stalePending;
        return "saved";
    }
    const held = await heldByAnother();
    if (held) return held;
    try {
        await prisma.$transaction([
            prisma.user.update({ where: { id: userId }, data: { phone, phoneVerifiedAt: null } }),
            stalePending,
        ]);
    } catch (error) {
        // Another account saved the same number between the check and the
        // write; the unique number says so. Answer as the check would have.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
        return (await heldByAnother()) ?? PHONE_IN_USE_CODE;
    }
    return "saved";
}

/** Remove the account's number and anything waiting behind it. */
export async function clearPhone(userId: string): Promise<void> {
    await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { phone: null, phoneVerifiedAt: null } }),
        prisma.phoneVerification.deleteMany({ where: { userId } }),
    ]);
}

export type RequestCodeResult =
    | {
          ok: true;
          /** Where the code went; `log` is the development stand-in for Notis. */
          channel: CodeChannel;
          /** Set when no new code went out because the last one still works: the wait before another. */
          resendInMs?: number;
      }
    | { ok: false; code: string; retryAfterMs?: number };

/** A transaction-scoped Postgres advisory lock, released at commit or rollback. */
async function lock(tx: Prisma.TransactionClient, key: string): Promise<void> {
    // ::text: the function returns void, which the query engine cannot read back.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
}

/**
 * Send a code to the reader's pending number, or to `rawPhone` after staging
 * it. The limits are checked and the send is reserved under one lock, so
 * concurrent requests cannot both pass them. The code goes out after the
 * commit; an SMS that did not go out releases its reservation and leaves the
 * previous code working.
 */
export async function requestPhoneCode(
    userId: string,
    options: { rawPhone?: string | null; locale?: VerificationLocale; now?: () => Date } = {},
): Promise<RequestCodeResult> {
    const now = options.now ?? (() => new Date());
    let pending: PhoneVerification;
    if (options.rawPhone) {
        const parsed = normalizeMobilePhone(options.rawPhone);
        if (!parsed.ok) return { ok: false, code: PHONE_REJECTION_CODES[parsed.reason] };
        const staged = await stagePhone(userId, parsed.e164);
        if (!staged.ok) return staged;
        pending = staged.pending;
    } else {
        const found = await prisma.phoneVerification.findUnique({ where: { userId } });
        if (!found) return { ok: false, code: "no_pending" };
        if (await phoneVerifiedByAnotherUser(found.phone, userId)) return { ok: false, code: PHONE_IN_USE_CODE };
        pending = found;
    }

    const at = now();
    const code = generateCode();
    const codeHash = hashCode(code, env.NEXTAUTH_SECRET);
    const expiresAt = new Date(at.getTime() + CODE_TTL_MS);
    const windowStart = new Date(at.getTime() - SEND_WINDOW_MS);
    const phone = pending.phone;

    const reserved = await prisma.$transaction(async (tx) => {
        // The number first, then the account: every request takes its two
        // locks in this order, so no two requests wait on each other.
        await lock(tx, `phone-code:phone:${phone}`);
        await lock(tx, `phone-code:user:${userId}`);
        await tx.phoneCodeSend.deleteMany({
            where: { createdAt: { lt: windowStart }, OR: [{ userId }, { phone }] },
        });
        const [userSends, phoneSends] = await Promise.all([
            tx.phoneCodeSend.findMany({ where: { userId }, select: { createdAt: true } }),
            tx.phoneCodeSend.findMany({ where: { phone }, select: { createdAt: true } }),
        ]);
        const allowance = sendAllowance(
            { userSends: userSends.map((s) => s.createdAt), phoneSends: phoneSends.map((s) => s.createdAt) },
            at,
        );
        if (!allowance.ok) {
            const current = await tx.phoneVerification.findUnique({ where: { id: pending.id } });
            return { kind: "refused", refused: allowance, current } as const;
        }
        // The code is written only onto the number it goes to: a request that
        // staged another number meanwhile must not inherit a code it never
        // received.
        const written = await tx.phoneVerification.updateMany({
            where: { id: pending.id, phone },
            data: { codeHash, expiresAt, attempts: 0 },
        });
        if (written.count === 0) return { kind: "moved" } as const;
        const send = await tx.phoneCodeSend.create({ data: { userId, phone, createdAt: at }, select: { id: true } });
        return { kind: "reserved", sendId: send.id } as const;
    });

    if (reserved.kind === "moved") return { ok: false, code: "no_pending" };
    if (reserved.kind === "refused") {
        const { refused, current } = reserved;
        // The last code still works: the reader who reopens the form types
        // it, rather than read a refusal and wait for another.
        if (
            current?.phone === phone &&
            current.codeHash &&
            current.expiresAt &&
            !isExpired(current.expiresAt, at) &&
            current.attempts < MAX_ATTEMPTS
        ) {
            return { ok: true, channel: carrierChannel(), resendInMs: refused.retryAfterMs };
        }
        return { ok: false, code: refused.reason, retryAfterMs: refused.retryAfterMs };
    }

    const carried = await carryCode(phone, code, options.locale ?? "el");
    if (!carried.ok) {
        // No SMS went out: the send does not count, and the code
        // that was out before keeps working — unless the row moved on meanwhile.
        await prisma.$transaction([
            prisma.phoneCodeSend.deleteMany({ where: { id: reserved.sendId } }),
            prisma.phoneVerification.updateMany({
                where: { id: pending.id, phone, codeHash },
                data: { codeHash: pending.codeHash, expiresAt: pending.expiresAt, attempts: pending.attempts },
            }),
        ]);
        return carried;
    }
    return { ok: true, channel: carried.channel };
}

/** Where codes go on this deployment: the same rule carryCode follows. */
function carrierChannel(): CodeChannel {
    return !isSmsConfigured() && DEV_TOOLS_ALLOWED ? "log" : "sms";
}

async function carryCode(
    phone: string,
    code: string,
    locale: VerificationLocale,
): Promise<{ ok: true; channel: CodeChannel } | { ok: false; code: "send_failed" }> {
    if (isSmsConfigured()) {
        const result = await sendVerificationSms(phone, code, locale);
        return result.ok ? { ok: true, channel: "sms" } : { ok: false, code: "send_failed" };
    }
    if (DEV_TOOLS_ALLOWED) {
        console.log(`[phone-verification] SMS is not configured; the code for ${phone} is ${code}`);
        return { ok: true, channel: "log" };
    }
    console.error("Verification SMS is not configured (BIRD_API_KEY, BIRD_WORKSPACE_ID, BIRD_SMS_CHANNEL_ID)");
    return { ok: false, code: "send_failed" };
}

export type ConfirmCodeResult =
    | { ok: true; phone: string }
    | {
          ok: false;
          code: "no_pending" | "code_expired" | "code_invalid" | "too_many_attempts" | typeof PHONE_IN_USE_CODE;
          attemptsLeft?: number;
      };

/**
 * The reader typed a code. An attempt is claimed before the comparison, in
 * one conditional update, so parallel guesses each spend one and no more
 * than MAX_ATTEMPTS are ever compared against a code. A match moves the
 * number onto the account: an unverified claim another account still
 * carries from before verification existed gives way, a verified one wins
 * and the reader hears `phone_in_use`.
 */
export async function confirmPhoneCode(
    userId: string,
    code: string,
    now: () => Date = () => new Date(),
): Promise<ConfirmCodeResult> {
    const pending = await prisma.phoneVerification.findUnique({ where: { userId } });
    if (!pending?.codeHash) return { ok: false, code: "no_pending" };
    const at = now();
    if (isExpired(pending.expiresAt, at)) return { ok: false, code: "code_expired" };

    const claimed = await prisma.phoneVerification.updateMany({
        where: { id: pending.id, codeHash: pending.codeHash, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
        const current = await prisma.phoneVerification.findUnique({ where: { id: pending.id } });
        if (!current?.codeHash) return { ok: false, code: "no_pending" };
        // A newer code replaced this one while it was typed.
        if (current.codeHash !== pending.codeHash) return { ok: false, code: "code_expired" };
        return { ok: false, code: "too_many_attempts" };
    }

    if (!codeMatches(code.trim(), pending.codeHash, env.NEXTAUTH_SECRET)) {
        const current = await prisma.phoneVerification.findUnique({ where: { id: pending.id }, select: { attempts: true } });
        const attemptsLeft = MAX_ATTEMPTS - (current?.attempts ?? MAX_ATTEMPTS);
        return attemptsLeft > 0
            ? { ok: false, code: "code_invalid", attemptsLeft }
            : { ok: false, code: "too_many_attempts" };
    }

    return prisma.$transaction(async (tx) => {
        // One confirmation per number at a time, across accounts: without it
        // two accounts could both pass the holder check below, and the later
        // one would take the number from the one just told it was theirs.
        await lock(tx, `phone-code:phone:${pending.phone}`);
        const verifiedHolder = await tx.user.findFirst({
            where: { phone: pending.phone, phoneVerifiedAt: { not: null }, NOT: { id: userId } },
            select: { id: true },
        });
        if (verifiedHolder) return { ok: false as const, code: PHONE_IN_USE_CODE };
        // Taking the row is the claim on this confirmation: a second, parallel
        // one with the same code finds it gone and moves nothing twice.
        const taken = await tx.phoneVerification.deleteMany({ where: { id: pending.id, codeHash: pending.codeHash } });
        if (taken.count === 0) {
            const user = await tx.user.findUnique({ where: { id: userId }, select: { phone: true, phoneVerifiedAt: true } });
            return user?.phone === pending.phone && user.phoneVerifiedAt
                ? { ok: true as const, phone: pending.phone }
                : { ok: false as const, code: "code_expired" as const };
        }
        await tx.user.updateMany({
            where: { phone: pending.phone, phoneVerifiedAt: null, NOT: { id: userId } },
            data: { phone: null },
        });
        await tx.user.update({ where: { id: userId }, data: { phone: pending.phone, phoneVerifiedAt: at } });
        return { ok: true as const, phone: pending.phone };
    });
}
