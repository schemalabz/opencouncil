import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Text,
} from "@react-email/components"
import * as React from "react"
import { klitiki } from "@/lib/utils"

interface WelcomeEmailProps {
    userName: string
    cityName: string
}

export const WelcomeEmail = ({ userName, cityName }: WelcomeEmailProps) => {
    const previewText = `Καλώς ήρθατε στο OpenCouncil`

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={h1}>Καλώς ήρθατε στο OpenCouncil!</Heading>

                    <Text style={text}>
                        Γεια σας {userName},
                    </Text>

                    <Text style={text}>
                        Εγγραφήκατε επιτυχώς για ειδοποιήσεις από το OpenCouncil για <strong>{cityName}</strong>.
                    </Text>

                    <Text style={text}>
                        Θα λαμβάνετε ενημερώσεις για θέματα που σας αφορούν με βάση τις τοποθεσίες και τα θέματα ενδιαφέροντος που επιλέξατε.
                    </Text>

                    <Container style={tipBox}>
                        <Text style={tipText}>
                            💡 Μπορείτε να ενημερώσετε τις προτιμήσεις σας ανά πάσα στιγμή από το προφίλ σας.
                        </Text>
                    </Container>

                    <Text style={text}>
                        Ευχαριστούμε που είστε μαζί μας!
                    </Text>

                    <Text style={footer}>
                        Η ομάδα του OpenCouncil
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}

export default WelcomeEmail

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
    color: "#111827",
    fontSize: "24px",
    fontWeight: "600",
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

const tipBox = {
    backgroundColor: "#f3f4f6",
    borderRadius: "8px",
    padding: "16px",
    margin: "32px 0",
}

const tipText = {
    color: "#6b7280",
    fontSize: "14px",
    margin: "0",
    lineHeight: "20px",
}

const footer = {
    color: "#6b7280",
    fontSize: "14px",
    margin: "24px 0",
    lineHeight: "20px",
}

