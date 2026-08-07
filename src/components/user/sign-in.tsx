"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { signInWithEmail } from "@/lib/serverSignIn"
import { useState } from "react"
import posthog from "posthog-js"

export function SignIn() {
    const t = useTranslations("SignIn")
    const searchParams = useSearchParams()
    const email = searchParams.get("email")
    const callbackUrl = searchParams.get("callbackUrl")
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        const formData = new FormData(e.currentTarget)

        posthog.capture("sign_in_requested", { has_callback_url: !!callbackUrl })

        try {
            await signInWithEmail(formData)
        } catch (err) {
            posthog.captureException(err)
            setError(t("error"))
            console.error("Sign in error:", err)
        } finally {
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