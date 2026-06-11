import { SignIn } from "@/components/user/sign-in"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { safeRedirectPath } from "@/lib/safeRedirect"

export default async function SignInPage(
    props: {
        searchParams: Promise<{ callbackUrl?: string | string[] }>
    }
) {
    const searchParams = await props.searchParams;
    const session = await auth()

    if (session) {
        const raw = Array.isArray(searchParams.callbackUrl) ? searchParams.callbackUrl[0] : searchParams.callbackUrl
        redirect(safeRedirectPath(raw))
    }

    return (
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
            <SignIn />
        </div>
    )
}
