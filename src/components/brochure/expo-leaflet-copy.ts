/**
 * Every line of copy in the expo leaflet, in one place. The PDF reads it, and
 * `pnpm leaflet:expo:copy` writes it to a Word file for editing; the keys are stable,
 * so an edited file maps back line for line.
 *
 * Curly placeholders ({live}, {preview}, {date}, …) are filled from the data when the
 * leaflet renders. "{accent}" marks the part of a sentence set in orange. A "\n" is a
 * forced line break. Lists keep their order.
 */
export const EXPO_COPY = {
    front: {
        headline: "Your council already meets in public.",
        headlineAccent: "Make the city pay attention.",
        statement: "We carefully transcribe city council sessions and turn them into summarised subjects, WhatsApp updates for citizens, and official minute documents for staff.",
        mapCaption: "Chania, {date}. A real subject, and the message residents of the street received about it.",
        stats: [
            { value: "{live}", label: "live councils\nin Greece" },
            { value: "{preview}", label: "European cities\npreviewed" },
            { value: "1,000+", label: "hours of meetings\non the record" },
        ],
        footer: "{expoName}\nBarcelona · 3–5 Nov 2026",
    },
    whatsapp: {
        sender: "Notis · OpenCouncil",
        status: "Business account",
        dateChip: "TODAY",
        message: "In tonight’s municipal committee meeting, a subject affecting your street was discussed:",
        place: "{place}, Nea Chora",
        link: "View the debate",
        time: "21:14",
        composer: "Message",
    },
    flap: {
        kicker: "Live in {live} municipalities in Greece",
        demoKicker: "Now opening across Europe",
        demoTitle: "See it on your own council’s meeting.",
        demoText: "Tell us the name of your council. Within 24 hours you get a link to one of its meetings, on the record.",
        scan: "Scan to request a free demo",
        previewed: "Already previewed in {preview} European cities: {cities}",
    },
    back: {
        kicker: "Find us in Barcelona",
        expoName: "Smart City Expo World Congress",
        expoWhen: "3–5 Nov 2026 · Fira Gran Via, Barcelona",
        stand: "Hall 3 · Stand S20",
        area: "Innovation Playground",
        pitch: "Pitch · Wed 4 Nov, 16:05",
        stage: "Innovation Playground Stage",
        legendLive: "{live} live councils in Greece",
        legendPreview: "{preview} previews in {countries} more countries",
        teamKicker: "The team",
        closing: "The system of record for {accent}.",
        closingAccent: "local government democracy",
        note: "OpenCouncil P.C. is wholly owned by Schema Labs, a non-profit based in Athens. Open source under the AGPL v3 licence.",
    },
    contacts: {
        email: "contact@opencouncil.eu",
        whatsapp: "+30 698 058 6851",
        site: "opencouncil.eu",
    },
    residents: {
        kicker: "For residents",
        title: "Hours-long meetings, understood in minutes.",
        screenshotCaption: "Athens City Council, 21 Oct 2026: “Safety of the Gkravas school complex”. Twenty speakers and 117 minutes of debate on one page: the video, a summary, each speaker’s position and the decision.",
        features: [
            { title: "Subjects and summaries", text: "Every meeting is split into subjects. For each one: a summary, each speaker’s position in brief, the video and the decision." },
            { title: "Search", text: "Search everything that has been said, in every meeting." },
            { title: "WhatsApp updates", text: "Residents get a message whenever the council discusses their street, their neighbourhood or a subject they follow." },
            { title: "Subject map", text: "The council’s subjects on the map. Zoom into any area, neighbourhood and street." },
            { title: "Councillors and parties", text: "Every councillor’s own page: what they spoke on, for how long, and where they stood on each subject." },
        ],
    },
    staff: {
        kicker: "For council staff",
        title: "What took days now takes hours.",
        bigNumber: "48h",
        bigNumberText: "from the end of the meeting to a transcript of every word, every speaker recognised, checked by a person.",
        items: [
            { title: "Minutes ready to sign", text: "The meeting’s minutes, with attendance, votes and decisions, ready for review and signature." },
            { title: "Open API and MCP server", text: "The record is open data. Query it through the public API, or ask about your council in Claude or ChatGPT." },
            { title: "Your data, in Europe", text: "Hosted in the EU, GDPR compliant, open source. European or self-hosted models when your policy asks for it." },
        ],
        cardsKicker: "What European councils discussed",
        punchline: "OpenCouncil can replace the company that writes your minutes and transcripts today, {accent}",
        punchlineAccent: "at a similar cost and with 10x the functionality.",
    },
    how: {
        kicker: "How it works",
        title: "One video of the meeting in. Everything else out.",
        intro: "Nothing to install. The stream your council already runs is enough.",
        steps: [
            { title: "The meeting", text: "The council’s own stream or recording, as it is." },
            { title: "Carefully transcribed", text: "Every word and every speaker, checked by a person. Then subjects, summaries and decisions." },
            { title: "Published and searchable", text: "Each subject on its own page, in search, on the map. The record of the city." },
            { title: "Sent to the people it concerns", text: "A WhatsApp message to the residents who follow the subject. Minutes documents to the staff who sign them." },
        ],
        awardsKicker: "Awards and mentions",
        awards: [
            { title: "Digital Governance Award", detail: "Best Applied Idea in Local Government, Greek Ministry of Digital Governance" },
            { title: "European Public Sector Award 2025–26", detail: "Good Practice Certificate, EIPA" },
            { title: "Innovation in Politics Awards 2026", detail: "Finalist" },
            { title: "7th Guangzhou International Award for Urban Innovation", detail: "Finalist" },
            { title: "OECD.AI Policy Navigator", detail: "the OECD catalogue of AI in the public sector" },
        ],
    },
};

export type ExpoCopy = typeof EXPO_COPY;

/** Where each section prints, for the Word export. */
export const EXPO_COPY_SECTIONS: Array<{ key: keyof ExpoCopy; title: string; where: string }> = [
    { key: "front", title: "Cover", where: "Outside, right panel: the page people see first." },
    { key: "whatsapp", title: "WhatsApp message on the cover", where: "The phone screen drawn over the Chania map." },
    { key: "flap", title: "Flap", where: "Outside, left panel: folds in behind the cover; the Greek crests, the mayor's line and the demo QR code." },
    { key: "back", title: "Back", where: "Outside, middle panel: stand, Europe map, team, contacts, closing line." },
    { key: "contacts", title: "Contacts", where: "Back panel, next to the QR code." },
    { key: "residents", title: "Inside: for residents", where: "Inside, left panel." },
    { key: "staff", title: "Inside: for council staff", where: "Inside, middle panel (tinted)." },
    { key: "how", title: "Inside: how it works", where: "Inside, right panel, with the awards." },
];

/** Replace {name} placeholders. Unknown names are left as they are, so a typo shows in print. */
export function fill(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
