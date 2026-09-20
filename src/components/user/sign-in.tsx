"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { signInWithEmail } from "@/lib/serverSignIn"
import { useState } from "react"
import { MailCheck } from "lucide-react"
import posthog from "posthog-js"

export function SignIn() {
    const t = useTranslations("SignIn")
    const searchParams = useSearchParams()
    const email = searchParams.get("email")
    const callbackUrl = searchParams.get("callbackUrl")
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [sentTo, setSentTo] = useState<string | null>(null)
    const [draftEmail, setDraftEmail] = useState(email ?? "")

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        const formData = new FormData(e.currentTarget)

        posthog.capture("sign_in_requested", { has_callback_url: !!callbackUrl })

        try {
            await signInWithEmail(formData)
            // The email is sent. Confirm it here rather than on Auth.js's
            // built-in verify-request page, which is unstyled, untranslated
            // and outside the site layout.
            setSentTo(String(formData.get("email") ?? ""))
        } catch (err) {
            posthog.captureException(err)
            setError(t("error"))
            console.error("Sign in error:", err)
        } finally {
            setIsLoading(false)
        }
    }

    if (sentTo) {
        return (
            <Card className="max-w-xl">
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
                            defaultValue={draftEmail}
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