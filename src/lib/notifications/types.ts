import type { NextResponse } from 'next/server';

/** The Bird webhook's verification results. The sender's types left with the sender. */

export type VerifySignatureResult = { ok: true } | { ok: false; reason: string };

export type VerifyRequestResult =
    | { ok: true; event: unknown }
    | { ok: false; response: NextResponse };
