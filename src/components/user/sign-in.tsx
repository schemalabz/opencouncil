"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { GoogleMark } from "@/components/ui/google-mark"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { signIn } from "next-auth/react"
import { signInWithEmail } from "@/lib/serverSignIn"
import { useState } from "react"
import { MailCheck } from "lucide-react"
import posthog from "posthog-js"
import { useBfcacheRestore } from "@/hooks/useBfcacheRestore"

/** One width for both states of the card, so it does not jump between them. */
const CARD_CLASS = "w-full max-w-xl"

/**
 * The Auth.js error codes that reach this page (pages.error in
 * auth.config.ts), by the message key that explains each. Anything else is
 * the generic one.
 */
const AUTH_ERROR_KEYS: Record<string, string> = {
    // The magic link was used already, or its token expired.
    Verification: "errors.verification",
    // The signIn callback refused: a Google account with an unverified email.
    AccessDenied: "errors.accessDenied",
}

function authErrorKey(code: string | null): string | null {
    if (!code) return null
    // hasOwn: the code comes from the URL, and a plain lookup would resolve
    // "constructor" or "__proto__" to a function instead of a message key.
    return Object.hasOwn(AUTH_ERROR_KEYS, code) ? AUTH_ERROR_KEYS[code] : "errors.generic"
}

export function SignIn({
    googleAvailable = false,
    callbackUrl = null,
}: {
    googleAvailable?: boolean
    /** Where the sign-in lands; the page resolves it from the query or Auth.js's cookie. */
    callbackUrl?: string | null
}) {
    const t = useTranslations("SignIn")
    const searchParams = useSearchParams()
    const email = searchParams.get("email")
    const [error, setError] = useState<string | null>(authErrorKey(searchParams.get("error")))
    const [isLoading, setIsLoading] = useState(false)
    const [sentTo, setSentTo] = useState<string | null>(null)
    const [draftEmail, setDraftEmail] = useState(email ?? "")
    // Back from Google restores this page with isLoading still true.
    useBfcacheRestore(() => setIsLoading(false))

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        const formData = new FormData(e.currentTarget)

        posthog.capture("sign_in_requested", { method: "email", has_callback_url: !!callbackUrl })

        try {
            await signInWithEmail(formData)
            // The email is sent. Confirm it here rather than on Auth.js's
            // built-in verify-request page, which is unstyled, untranslated
            // and outside the site layout.
            setSentTo(String(formData.get("email") ?? ""))
        } catch (err) {
            posthog.captureException(err)
            setError("error")
            console.error("Sign in error:", err)
        } finally {
            setIsLoading(false)
        }
    }

    async function handleGoogle() {
        setError(null)
        setIsLoading(true)
        posthog.capture("sign_in_requested", { method: "google", has_callback_url: !!callbackUrl })
        // Leaves the page for Google; the callback lands on callbackUrl, or
        // on the profile, the same default as the magic link.
        await signIn("google", { redirectTo: callbackUrl ?? "/profile" })
    }

    if (sentTo) {
        return (
            <Card className={CARD_CLASS}>
                <CardHeader className="items-center text-center">
                    <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <MailCheck className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h2 className="text-2xl font-semibold">{t("checkEmail.title")}</h2>
                </CardHeader>
                <CardContent className="space-y-2 text-center">
                    <p>
                        {t.rich("checkEmail.description", {
                            email: sentTo,
                            strong: (chunks) => <strong className="font-semibold break-words">{chunks}</strong>,
                        })}
                    </p>
                    <p className="text-sm text-muted-foreground">{t("checkEmail.hint")}</p>
                </CardContent>
                <CardFooter>
                    <Button variant="outline" className="w-full" onClick={() => { setDraftEmail(sentTo); setSentTo(null) }}>
                        {t("checkEmail.useDifferentEmail")}
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card className={CARD_CLASS}>
            <CardHeader>
                <h2 className="text-2xl font-semibold text-center">{t("title")}</h2>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent>
                    <div className="space-y-4">
                        {googleAvailable && (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full gap-2.5"
                                    disabled={isLoading}
                                    onClick={handleGoogle}
                                >
                                    <GoogleMark className="h-4 w-4" />
                                    {t("google")}
                                </Button>
                                <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground" aria-hidden>
                                    <span className="h-px flex-1 bg-border" />
                                    {t("or")}
                                    <span className="h-px flex-1 bg-border" />
                                </div>
                            </>
                        )}
                        <Input
                            type="email"
                            name="email"
                            placeholder={t("emailPlaceholder")}
                            className="w-full"
                            required
                            defaultValue={draftEmail}
                            disabled={isLoading}
                        />
                        {callbackUrl && (
                            <input type="hidden" name="callbackUrl" value={callbackUrl} />
                        )}
                        {error && (
                            <p className="text-sm text-red-500" role="alert">{t(error)}</p>
                        )}
                    </div>
                </CardContent>
                <CardFooter>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? t("loading") : t("submit")}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    )
}
