"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { useSearchParams } from "next/navigation"
import { signInWithEmail } from "@/lib/serverSignIn"
export function SignIn() {
    const searchParams = useSearchParams()
    const email = searchParams.get("email")

    return (
        <Card className="max-w-xl">
            <CardHeader>
                <h2 className="text-2xl font-semibold text-center">Σύνδεση στο OpenCouncil</h2>
                <p className="text-sm text-center text-muted-foreground">
                    Δε χρειάζεστε να συνδεθείτε στο OpenCouncil αν δεν είστε διαχειριστής κάποιας πόλης, παράταξης ή προσώπου.
                </p>
            </CardHeader>
            <form
                action={signInWithEmail}
            >
                <CardContent>
                    <div className="space-y-4">
                        <Input
                            type="email"
                            name="email"
                            placeholder="Εισάγετε το email σας"
                            className="w-full"
                            required
                            defaultValue={email || ""}
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button type="submit" className="w-full">
                        Συνέχεια με Email
                    </Button>
                </CardFooter>
            </form>
        </Card>
    )
}