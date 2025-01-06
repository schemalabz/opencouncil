import Resend from "next-auth/providers/resend"
import type { NextAuthConfig } from "next-auth"
import { AuthEmail } from "./lib/email/templates/AuthEmail"
import { renderReactEmailToHtml } from "./lib/email/render"

export default {
    trustHost: true,
    providers: [Resend({
        from: 'OpenCouncil <auth@opencouncil.gr>',
        apiKey: process.env.RESEND_API_KEY,
        sendVerificationRequest: async (params) => {
            const { identifier: to, provider, url, theme } = params
            const html = await renderReactEmailToHtml(AuthEmail({ url }))

            const res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${provider.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: provider.from,
                    to,
                    subject: `Συνδεθείτε στο OpenCouncil`,
                    html,
                    text: `Συνδεθείτε στο OpenCouncil: ${url}`,
                }),
            })

            if (!res.ok)
                throw new Error("Resend error: " + JSON.stringify(await res.json()))
        },
    })],
} satisfies NextAuthConfig
