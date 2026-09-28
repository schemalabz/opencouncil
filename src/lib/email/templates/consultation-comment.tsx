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
import { geniki } from "@/lib/utils/geniki"
import sanitizeHtml from 'sanitize-html'
import { buildConsultationUrl, getConsultationViewForEntityType } from "@/components/consultations/consultationUrl"

interface ConsultationCommentEmailProps {
    userName: string
    userEmail: string
    consultationTitle: string
    entityType: 'chapter' | 'article' | 'geoset' | 'geometry'
    entityId: string
    /** The place or section, named as the consultation's screens name it. */
    entityLabel: string
    commentBody: string
    consultationUrl: string
}

export const ConsultationCommentEmail = ({
    userName,
    userEmail,
    consultationTitle,
    entityType,
    entityId,
    entityLabel,
    commentBody,
    consultationUrl
}: ConsultationCommentEmailProps) => {

    // Sanitize HTML content to only allow safe tags for email
    const getSafeHtmlContent = (html: string): string => {
        return sanitizeHtml(html, {
            // Paragraphs and line breaks carry the structure of a plain-text comment.
            allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'a'],
            allowedAttributes: {
                'a': ['href']
            },
            allowedSchemes: ['http', 'https', 'mailto'],
            transformTags: {
                // Remove any attributes from formatting tags
                'strong': () => ({ tagName: 'strong', attribs: {} }),
                'b': () => ({ tagName: 'strong', attribs: {} }),
                'em': () => ({ tagName: 'em', attribs: {} }),
                'i': () => ({ tagName: 'em', attribs: {} }),
            }
        });
    };

    const userNameGeniki = geniki(userName);

    // Generate permalink to the specific entity
    const getEntityPermalink = (entityType: string, entityId: string): string => {
        const consultationEntityType =
            entityType === 'chapter' ||
            entityType === 'article' ||
            entityType === 'geoset' ||
            entityType === 'geometry'
                ? entityType
                : 'geometry';
        const view = getConsultationViewForEntityType(consultationEntityType);

        return buildConsultationUrl(consultationUrl, { view, entityId });
    };

    const entityPermalink = getEntityPermalink(entityType, entityId);
    const previewText = `Διαβούλευση ${consultationTitle} - σχόλιο από ${userName}`;

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Body style={main}>
                <Container style={container}>

                    <Text style={text}>Αξιότιμες κυρίες και κύριοι,</Text>

                    <Text style={text}>
                        Παρακαλώ όπως συμπεριλάβετε το ακόλουθο σχόλιο
                        στη διαδικασία της διαβούλευσης &ldquo;<strong>{consultationTitle}</strong>&rdquo;,
                        και συγκεκριμένα για &ldquo;<Link href={entityPermalink} style={link}>{entityLabel}</Link>&rdquo;.
                    </Text>

                    <Container style={commentSection}>
                        <Text style={label}><strong>Όνομα Υποβάλλοντα:</strong></Text>
                        <Text style={value}>{userName}</Text>

                        <Text style={label}><strong>Διεύθυνση email:</strong></Text>
                        <Text style={value}>{userEmail} (CC σε αυτό το μήνυμα)</Text>

                        <Text style={label}><strong>Αφορά:</strong></Text>
                        <Text style={value}>{entityLabel}</Text>

                        <Text style={label}><strong>Σχόλιο:</strong></Text>
                        <div style={text} dangerouslySetInnerHTML={{ __html: getSafeHtmlContent(commentBody) }} />
                    </Container>

                    <Text style={text}>
                        Αυτό το email στάλθηκε αυτόματα από τη πλατφόρμα διαβουλεύσεων του OpenCouncil.gr
                        και εκ μέρους του χρήστη <strong>{userName}</strong>, που μας ζήτησε να σας το προωθήσουμε.
                        Μπορείτε να δείτε όλα τα σχόλια της διαβούλευσης στο{' '}
                        <Link href={consultationUrl} style={link}>
                            {consultationUrl}
                        </Link>.
                    </Text>

                    <Text style={text}>
                        Για ερωτήσεις και τεχνική υποστήριξη μπορείτε να επικοινωνήσετε με την OpenCouncil
                        στο hello@opencouncil.gr, ή στο +30 2111980212.
                    </Text>

                    <Text style={text}>
                        Με εκτίμηση,
                        <br />
                        εκ μέρους του χρήστη,
                        <br />
                        <strong>OpenCouncil</strong>
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}

export default ConsultationCommentEmail

const main = {
    backgroundColor: "#ffffff",
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
}

const container = {
    margin: "0 auto",
    padding: "20px 0 48px",
    maxWidth: "600px",
}

const h1 = {
    color: "#333",
    fontSize: "22px",
    fontWeight: "bold",
    margin: "40px 0 30px 0",
    padding: "0",
    lineHeight: "32px",
}

const text = {
    color: "#333",
    fontSize: "16px",
    margin: "20px 0",
    lineHeight: "24px",
}

const commentSection = {
    backgroundColor: "#f8f9fa",
    padding: "20px",
    margin: "30px 0",
}

const label = {
    color: "#495057",
    fontSize: "14px",
    fontWeight: "600" as const,
    margin: "12px 0 4px 0",
    lineHeight: "20px",
}

const value = {
    color: "#333",
    fontSize: "16px",
    margin: "0 0 16px 0",
    lineHeight: "24px",
}



const link = {
    color: "#007bff",
    textDecoration: "underline",
} 