"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { signInWithEmail } from "@/lib/serverSignIn"
import { useEffect, useState } from "react"
import posthog from "posthog-js"

export function SignIn() {
    const t = useTranslations("SignIn")
    const searchParams = useSearchParams()
    const email = searchParams.get("email")
    const callbackUrl = searchParams.get("callbackUrl")
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    // The success path keeps isLoading true while the page navigates away. A
    // Back navigation can restore the page from bfcache with that state
    // intact, which would leave the form disabled.
    useEffect(() => {
        const onPageShow = (e: PageTransitionEvent) => {
            if (e.persisted) setIsLoading(false)
        }
        window.addEventListener("pageshow", onPageShow)
        return () => window.removeEventListener("pageshow", onPageShow)
    }, [])

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        const formData = new FormData(e.currentTarget)

        posthog.capture("sign_in_requested", { has_callback_url: !!callbackUrl })

        try {
            const verifyRequestUrl = await signInWithEmail(formData)
            // The email is sent; show Auth.js's "check your email" page. The
            // action returns the URL instead of redirecting (see serverSignIn),
            // so only real failures reach the catch below. Navigate to the
            // path on the current origin: Auth.js builds the URL on
            // NEXTAUTH_URL's origin, which is the primary domain — a visitor
            // on another realm domain must stay on it, and the same app
            // serves /api/auth everywhere.
            const { pathname, search } = new URL(verifyRequestUrl)
            window.location.assign(`${pathname}${search}`)
        } catch (err) {
            posthog.captureException(err)
            setError(t("error"))
            console.error("Sign in error:", err)
            setIsLoading(false)
        }
    }

    return (
        <Card className="max-w-xl">
            <CardHeader>
                <h2 className="text-2xl font-semibold text-center">{t("title")}</h2>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent>
                    <div className="space-y-4">
                        <Input
                            type="email"
                            name="email"
                            placeholder={t("emailPlaceholder")}
                            className="w-full"
                            required
                            defaultValue={email || ""}
                            disabled={isLoading}
                        />
                        {callbackUrl && (
                            <input type="hidden" name="callbackUrl" value={callbackUrl} />
                        )}
                        {error && (
                            <p className="text-sm text-red-500">{error}</p>
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