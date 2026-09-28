"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { ErrorLine } from "@/components/ui/error-line"
import { OrDivider } from "@/components/ui/or-divider"
import { GoogleSignInButton } from "@/components/user/GoogleSignInButton"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { authErrorKey } from "@/lib/auth/authErrorKey"
import { signInWithEmail } from "@/lib/serverSignIn"
import { useState } from "react"
import { MailCheck } from "lucide-react"
import posthog from "posthog-js"

/** One width for both states of the card, so it does not jump between them. */
const CARD_CLASS = "w-full max-w-xl"

/** The Auth.js error codes this page explains, by message key; see authErrorKey. */
const AUTH_ERROR_KEYS: Record<string, string> = {
    // The magic link was used already, or its token expired.
    Verification: "errors.verification",
    // The signIn callback refused: a Google account with an unverified email.
    AccessDenied: "errors.accessDenied",
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
    const tCommon = useTranslations("Common")
    const searchParams = useSearchParams()
    const email = searchParams.get("email")
    const [error, setError] = useState<string | null>(authErrorKey(searchParams.get("error"), AUTH_ERROR_KEYS, "errors.generic"))
    const [isLoading, setIsLoading] = useState(false)
    const [sentTo, setSentTo] = useState<string | null>(null)
    const [draftEmail, setDraftEmail] = useState(email ?? "")

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

    function handleGoogleStart() {
        setError(null)
        posthog.capture("sign_in_requested", { method: "google", has_callback_url: !!callbackUrl })
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
                                {/* The callback lands on callbackUrl, or on the profile, the same default as the magic link. */}
                                <GoogleSignInButton
                                    redirectTo={callbackUrl ?? "/profile"}
                                    label={tCommon("continueWithGoogle")}
                                    disabled={isLoading}
                                    onStart={handleGoogleStart}
                                />
                                <OrDivider label={t("or")} />
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
                        {error && <ErrorLine>{t(error)}</ErrorLine>}
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
