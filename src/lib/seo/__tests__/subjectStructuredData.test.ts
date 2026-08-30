import { buildSubjectStructuredData, serializeStructuredData } from "../subjectStructuredData";

const BASE = {
    canonicalUrl: "https://opencouncil.gr/athens/feb26_2026/subjects/subj1",
    siteUrl: "https://opencouncil.gr",
    locale: "el",
    subjectName: "Οικόπεδα για σχολεία",
    subjectDescription: "Το συμβούλιο συζήτησε την παραχώρηση οικοπέδων.",
    subjectCreatedAt: "2026-02-27T10:00:00.000Z",
    subjectUpdatedAt: new Date("2026-03-01T09:30:00.000Z"),
    cityName: "Αθήνα",
    meetingName: "Συνεδρίαση Δημοτικού Συμβουλίου",
    meetingDate: new Date("2026-02-26T17:00:00.000Z"),
    administrativeBodyName: "Δημοτικό Συμβούλιο",
    topicName: "Παιδεία",
    citations: ["https://example.com/source"],
};

describe("buildSubjectStructuredData", () => {
    it("describes the subject as an Article about the meeting event", () => {
        expect(buildSubjectStructuredData(BASE)).toMatchObject({
            "@context": "https://schema.org",
            "@type": "Article",
            "@id": `${BASE.canonicalUrl}#article`,
            headline: BASE.subjectName,
            description: BASE.subjectDescription,
            datePublished: "2026-02-27T10:00:00.000Z",
            dateModified: "2026-03-01T09:30:00.000Z",
            inLanguage: "el",
            mainEntityOfPage: BASE.canonicalUrl,
            url: BASE.canonicalUrl,
            articleSection: "Παιδεία",
            citation: ["https://example.com/source"],
            author: { "@type": "Organization", name: "OpenCouncil", url: BASE.siteUrl },
            publisher: { "@type": "Organization", name: "OpenCouncil", url: BASE.siteUrl },
            about: [
                {
                    "@type": "Event",
                    name: BASE.meetingName,
                    startDate: "2026-02-26T17:00:00.000Z",
                    location: { "@type": "Place", name: "Αθήνα" },
                    organizer: { "@type": "GovernmentOrganization", name: "Δημοτικό Συμβούλιο" },
                },
                { "@type": "Thing", name: "Παιδεία" },
            ],
        });
    });

    it("falls back to the city as organizer and omits optional entries", () => {
        const data = buildSubjectStructuredData({
            ...BASE,
            administrativeBodyName: null,
            topicName: null,
            citations: [],
        });

        expect(data.about).toHaveLength(1);
        expect(data.about[0].organizer).toEqual({
            "@type": "GovernmentOrganization",
            name: "Αθήνα",
        });
        expect(data.articleSection).toBeUndefined();
        expect(data.citation).toBeUndefined();
    });

    it("emits no decision or vote data", () => {
        const serialized = serializeStructuredData(buildSubjectStructuredData(BASE));

        expect(serialized).not.toContain("abstract");
        expect(serialized).not.toContain("decision");
        expect(serialized).not.toContain("vote");
        expect(serialized).not.toContain("pdfUrl");
    });
});

describe("serializeStructuredData", () => {
    it("escapes markup-significant characters before embedding in HTML", () => {
        expect(serializeStructuredData({ value: "</script>" })).toBe('{"value":"\\u003c/script>"}');
    });
});
