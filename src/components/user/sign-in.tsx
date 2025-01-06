import { signIn } from "@/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"

export function SignIn() {
    return (
        <Card className="max-w-xl">
            <CardHeader>
                <h2 className="text-2xl font-semibold text-center">Σύνδεση στο OpenCouncil</h2>
                <p className="text-sm text-center text-muted-foreground">
                    Δε χρειάζεστε να συνδεθείτε στο OpenCouncil αν δεν είστε διαχειριστής κάποιας πόλης, παράταξης ή προσώπου.
                </p>
            </CardHeader>
            <form
                action={async (formData) => {
                    "use server"
                    await signIn("resend", formData, { redirectTo: "/profile" })
                }}
            >
                <CardContent>
                    <div className="space-y-4">
                        <Input
                            type="email"
                            name="email"
                            placeholder="Εισάγετε το email σας"
                            className="w-full"
                            required
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