type SubjectStructuredDataInput = {
    canonicalUrl: string;
    siteUrl: string;
    locale: string;
    subjectName: string;
    subjectDescription: string;
    // Dates survive as strings when they cross an unstable_cache boundary.
    subjectCreatedAt: Date | string;
    subjectUpdatedAt: Date | string;
    cityName: string;
    meetingName: string;
    meetingDate: Date | string;
    administrativeBodyName: string | null;
    topicName: string | null;
    citations: string[];
};

/**
 * Article JSON-LD for a subject page. The meeting appears as an Event
 * inside `about` (not `isPartOf`, which only accepts CreativeWork).
 * Decision and vote data stay out until the extraction pipeline earns
 * trust.
 */
export function buildSubjectStructuredData(input: SubjectStructuredDataInput) {
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "@id": `${input.canonicalUrl}#article`,
        headline: input.subjectName,
        description: input.subjectDescription,
        datePublished: new Date(input.subjectCreatedAt).toISOString(),
        dateModified: new Date(input.subjectUpdatedAt).toISOString(),
        inLanguage: input.locale,
        mainEntityOfPage: input.canonicalUrl,
        url: input.canonicalUrl,
        articleSection: input.topicName ?? undefined,
        citation: input.citations.length > 0 ? input.citations : undefined,
        author: { "@type": "Organization", name: "OpenCouncil", url: input.siteUrl },
        publisher: { "@type": "Organization", name: "OpenCouncil", url: input.siteUrl },
        about: [
            {
                "@type": "Event",
                name: input.meetingName,
                startDate: new Date(input.meetingDate).toISOString(),
                location: { "@type": "Place", name: input.cityName },
                organizer: {
                    "@type": "GovernmentOrganization",
                    name: input.administrativeBodyName ?? input.cityName,
                },
            },
            ...(input.topicName ? [{ "@type": "Thing", name: input.topicName }] : []),
        ],
    };
}

// The subject text is model-generated: escape `<` so a literal
// `</script>` inside it cannot close the JSON-LD script element.
export function serializeStructuredData(data: unknown): string {
    return JSON.stringify(data).replace(/</g, "\\u003c");
}
