import { SignIn } from "@/components/user/sign-in"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function SignInPage() {
    const session = await auth()

    if (session) {
        redirect("/profile")
    }

    return (
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
            <SignIn />
        </div>
    )
}
