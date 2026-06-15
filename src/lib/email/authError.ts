/**
 * Builds a clear, actionable error message for a failed Resend sign-in email send.
 *
 * Resend's most common local-dev failures are opaque by default:
 * - 403: the "from" domain in AUTH_EMAIL_FROM isn't verified on this account.
 * - 422: the recipient is a test/placeholder domain Resend blocks.
 *
 * Surfacing the status code, Resend's message, and a concrete next step turns a
 * generic "Server error" into something a contributor can fix.
 */
export function buildResendAuthErrorMessage(params: {
    status: number
    from: string | undefined
    to: string
    body?: { name?: string; message?: string }
    statusText?: string
}): string {
    const { status, from, to, body, statusText } = params
    // Resend messages often already end with a period ("...is not verified."), so
    // strip a trailing period before we add our own to avoid a doubled ".." artifact.
    const message = (body?.message || statusText || 'Unknown error').replace(/\.+$/, '')

    let hint = ''
    if (status === 403)
        hint = ` The "from" domain in AUTH_EMAIL_FROM ("${from}") is likely not verified on this Resend account. For local dev set AUTH_EMAIL_FROM to a Resend test sender, e.g. "OpenCouncil <onboarding@resend.dev>".`
    else if (status === 422)
        hint = ` Resend rejected the recipient ("${to}"). Use a real inbox you own (or set DEV_EMAIL_OVERRIDE) instead of placeholder domains like example.com.`

    return `Resend error (${status}): ${message}.${hint}`
}
