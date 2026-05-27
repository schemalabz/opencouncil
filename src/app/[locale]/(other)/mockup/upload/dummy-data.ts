export type DummyCity = {
    id: string;
    name: string;
    nameShort: string;
};

export type DummyMeeting = {
    id: string;
    cityId: string;
    title: string;
    administrativeBody: string;
    dateTime: string;
};

export const DUMMY_CITIES: DummyCity[] = [
    { id: "athens", name: "Δήμος Αθηναίων", nameShort: "Αθήνα" },
    { id: "thessaloniki", name: "Δήμος Θεσσαλονίκης", nameShort: "Θεσσαλονίκη" },
    { id: "patras", name: "Δήμος Πατρέων", nameShort: "Πάτρα" },
    { id: "chania", name: "Δήμος Χανίων", nameShort: "Χανιά" },
    { id: "heraklion", name: "Δήμος Ηρακλείου", nameShort: "Ηράκλειο" },
];

export const DUMMY_MEETINGS: DummyMeeting[] = [
    { id: "athens-2026-05-15", cityId: "athens", title: "Τακτική Συνεδρίαση", administrativeBody: "Δημοτικό Συμβούλιο", dateTime: "2026-05-15T18:00:00" },
    { id: "athens-2026-05-08", cityId: "athens", title: "Έκτακτη Συνεδρίαση", administrativeBody: "Δημοτικό Συμβούλιο", dateTime: "2026-05-08T19:00:00" },
    { id: "athens-2026-04-24", cityId: "athens", title: "Επιτροπή Ποιότητας Ζωής", administrativeBody: "Επιτροπή Ποιότητας Ζωής", dateTime: "2026-04-24T17:00:00" },
    { id: "thessaloniki-2026-05-12", cityId: "thessaloniki", title: "Τακτική Συνεδρίαση", administrativeBody: "Δημοτικό Συμβούλιο", dateTime: "2026-05-12T18:00:00" },
    { id: "thessaloniki-2026-04-28", cityId: "thessaloniki", title: "Οικονομική Επιτροπή", administrativeBody: "Οικονομική Επιτροπή", dateTime: "2026-04-28T16:00:00" },
    { id: "patras-2026-05-10", cityId: "patras", title: "Τακτική Συνεδρίαση", administrativeBody: "Δημοτικό Συμβούλιο", dateTime: "2026-05-10T18:30:00" },
    { id: "chania-2026-05-14", cityId: "chania", title: "Τακτική Συνεδρίαση", administrativeBody: "Δημοτικό Συμβούλιο", dateTime: "2026-05-14T19:00:00" },
    { id: "heraklion-2026-05-13", cityId: "heraklion", title: "Λογοδοσία", administrativeBody: "Δημοτικό Συμβούλιο", dateTime: "2026-05-13T18:00:00" },
];

export const ADMIN_BODIES = [
    "Δημοτικό Συμβούλιο",
    "Οικονομική Επιτροπή",
    "Επιτροπή Ποιότητας Ζωής",
    "Δημοτική Επιτροπή",
    "Λογοδοσία",
];

export const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/x-matroska", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/mp4"];
export const ACCEPTED_EXTENSIONS = [".mp4", ".mov", ".mkv", ".mp3", ".wav", ".m4a"];
export const MAX_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

/**
 * Pretends to parse a filename like `syn_dimou_athina_2026_05_15.mp4` into
 * { cityId, meetingId, confidence }. Returns null if parse fails.
 */
export function fakeParseFilename(filename: string): {
    city: DummyCity;
    meeting: DummyMeeting;
    confidence: number;
} | null {
    const lower = filename.toLowerCase();
    const cityMatchers: Array<{ keys: string[]; cityId: string }> = [
        { keys: ["athina", "athens", "αθην"], cityId: "athens" },
        { keys: ["thessaloniki", "salonik", "θεσσαλον"], cityId: "thessaloniki" },
        { keys: ["patra", "patras", "πατρ"], cityId: "patras" },
        { keys: ["chania", "xania", "χανι"], cityId: "chania" },
        { keys: ["heraklion", "iraklio", "ηρακλ"], cityId: "heraklion" },
    ];
    const cityHit = cityMatchers.find(c => c.keys.some(k => lower.includes(k)));
    if (!cityHit) return null;
    const city = DUMMY_CITIES.find(c => c.id === cityHit.cityId)!;

    const dateMatch = lower.match(/(20\d{2})[_\-\.](\d{1,2})[_\-\.](\d{1,2})/);
    if (!dateMatch) return null;
    const [, y, m, d] = dateMatch;
    const target = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

    const meeting = DUMMY_MEETINGS.find(
        mt => mt.cityId === city.id && mt.dateTime.startsWith(target)
    );
    if (!meeting) return null;

    return { city, meeting, confidence: 0.92 };
}
