"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { useSearchParams } from "next/navigation"
import { signInWithEmail } from "@/lib/serverSignIn"
import { useState } from "react"
import { useTranslations } from "next-intl"

export function SignIn() {
    const t = useTranslations('components.user.signIn');
    const searchParams = useSearchParams()
    const email = searchParams.get("email")
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            const formData = new FormData(e.currentTarget)
            await signInWithEmail(formData)
        } catch (err) {
            setError(t('error'));
            console.error("Sign in error:", err)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className="max-w-xl">
            <CardHeader>
                <h2 className="text-2xl font-semibold text-center">{t('title')}</h2>
                <p className="text-sm text-center text-muted-foreground">
                    {t('description')}
                </p>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent>
                    <div className="space-y-4">
                        <Input
                            type="email"
                            name="email"
                            placeholder={t('emailPlaceholder')}
                            className="w-full"
                            required
                            defaultValue={email || ""}
                            disabled={isLoading}
                        />
                        {error && (
                            <p className="text-sm text-red-500">{error}</p>
                        )}
                    </div>
                </CardContent>
                <CardFooter>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? t('loading') : t('submit')}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    )
}