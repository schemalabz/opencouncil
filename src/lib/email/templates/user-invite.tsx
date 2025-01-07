import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Link,
    Preview,
    Text,
} from "@react-email/components"
import * as React from "react"
import { klitiki } from "@/lib/utils"

interface UserInviteEmailProps {
    name: string
    inviteUrl: string
}

export const UserInviteEmail = ({ name, inviteUrl }: UserInviteEmailProps) => {
    const previewText = `Καλώς ήρθατε στο OpenCouncil`

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={h1}>Καλώς ήρθατε στο OpenCouncil</Heading>
                    <Text style={text}>Γεια σας {klitiki(name)},</Text>
                    <Text style={text}>
                        Έχετε προσκληθεί να συμμετάσχετε στο OpenCouncil ως διαχειριστής. Κάντε κλικ στον
                        παρακάτω σύνδεσμο για να συνδεθείτε και να ξεκινήσετε:
                    </Text>
                    <Link
                        href={inviteUrl}
                        style={button}
                    >
                        Σύνδεση στο OpenCouncil
                    </Link>
                    <Text style={text}>
                        Αν χρειάζεστε βοήθεια, απαντήστε σε αυτό το email ή καλέστε μας στο {process.env.NEXT_PUBLIC_CONTACT_PHONE}.
                    </Text>
                    <Text style={text}>
                        Με εκτίμηση,
                        <br />
                        Η ομάδα του OpenCouncil
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}

export default UserInviteEmail

const main = {
    backgroundColor: "#ffffff",
    fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
}

const container = {
    margin: "0 auto",
    padding: "20px 0 48px",
    maxWidth: "560px",
}

const h1 = {
    color: "#333",
    fontSize: "24px",
    fontWeight: "bold",
    margin: "40px 0",
    padding: "0",
    lineHeight: "40px",
}

const text = {
    color: "#333",
    fontSize: "16px",
    margin: "24px 0",
    lineHeight: "26px",
}

const button = {
    backgroundColor: "#000",
    borderRadius: "3px",
    color: "#fff",
    fontSize: "16px",
    textDecoration: "none",
    textAlign: "center" as const,
    display: "block",
    padding: "12px",
    margin: "24px 0",
}