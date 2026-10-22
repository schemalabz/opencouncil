import { AdministrativeBodyType, Prisma, PrismaClient } from "@prisma/client";

/**
 * A city with an archive larger than any list window, for the meetings tab.
 *
 * Deterministic: the same ids, names and dates on every run, so a test can name
 * a meeting. The shape follows the largest real archive (Chania: about 130
 * meetings, a few thousand subject names), plus the cases the tab must keep apart:
 *   - 4 meetings with no administrative body, named as council meetings
 *     (as the 4 Xylokastro rows on production are);
 *   - 3 unreleased meetings per body;
 *   - 3 released council meetings named «Ειδική Συνεδρίαση Λογοδοσίας», the
 *     oldest of them outside the newest 60;
 *   - one subject name that exists once, on the oldest committee meeting.
 */
const ARCHIVE_CITY_ID = "archive-test";

const MEETINGS_PER_BODY = 36;
const SUBJECTS_PER_MEETING = 30;
const FIRST_MEETING = Date.UTC(2023, 9, 2, 15, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

const BODIES = [
    { key: "council", name: "Δημοτικό Συμβούλιο", name_en: "Municipal Council", type: "council" },
    { key: "committee", name: "Δημοτική Επιτροπή", name_en: "Municipal Committee", type: "committee" },
    { key: "communityA", name: "1η Δημοτική Κοινότητα", name_en: "1st Municipal Community", type: "community" },
    { key: "communityB", name: "2η Δημοτική Κοινότητα", name_en: "2nd Municipal Community", type: "community" },
] as const satisfies readonly { key: string; name: string; name_en: string; type: AdministrativeBodyType }[];

type BodyKey = typeof BODIES[number]["key"];

const SUBJECT_TOPICS = [
    "Έγκριση προϋπολογισμού",
    "Ανάπλαση πλατείας",
    "Συντήρηση σχολικών κτιρίων",
    "Κυκλοφοριακές ρυθμίσεις",
    "Αποκομιδή απορριμμάτων",
    "Δημοτικός φωτισμός",
    "Πρόσληψη προσωπικού",
    "Παραχώρηση χρήσης χώρου",
    "Ηλεκτροκίνητα οχήματα",
    "Αθλητικές εγκαταστάσεις",
];

const ARCHIVE_MARKER_SUBJECT = "Ανακατασκευή γηπέδου Αγίου Νικολάου";

export interface MeetingArchive {
    cityId: string;
    bodies: Record<BodyKey, string>;
    unassignedIds: string[];
    unreleasedIds: string[];
}

function shortDate(date: Date): string {
    const dd = String(date.getUTCDate()).padStart(2, "0");
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const yy = String(date.getUTCFullYear()).slice(2);
    return `${dd}/${mm}/${yy}`;
}

function isUnreleased(index: number): boolean {
    return index % 12 === 5;
}

function isAccountability(bodyKey: BodyKey, index: number): boolean {
    return bodyKey === "council" && index % 12 === 0;
}

export async function buildMeetingArchive(
    prisma: PrismaClient,
    { cityId = ARCHIVE_CITY_ID }: { cityId?: string } = {},
): Promise<MeetingArchive> {
    await prisma.city.create({
        data: {
            id: cityId,
            name: "Αρχειούπολη",
            name_en: "Archive Town",
            name_municipality: "Δήμος Αρχειούπολης",
            name_municipality_en: "Municipality of Archive Town",
            timezone: "Europe/Athens",
            status: "supported",
            authorityType: "municipality",
        },
    });

    const bodies = {} as Record<BodyKey, string>;
    for (const body of BODIES) {
        const created = await prisma.administrativeBody.create({
            data: { cityId, name: body.name, name_en: body.name_en, type: body.type },
        });
        bodies[body.key] = created.id;
    }

    const meetings: (Prisma.CouncilMeetingCreateManyInput & { id: string })[] = [];
    const unreleasedIds: string[] = [];
    BODIES.forEach((body, bodyIndex) => {
        for (let index = 0; index < MEETINGS_PER_BODY; index++) {
            const dateTime = new Date(FIRST_MEETING + (index * 30 + bodyIndex) * DAY_MS);
            const accountability = isAccountability(body.key, index);
            const id = `${body.key}-${index}`;
            const released = !isUnreleased(index);
            if (!released) unreleasedIds.push(id);
            meetings.push({
                id,
                cityId,
                administrativeBodyId: bodies[body.key],
                dateTime,
                released,
                name: accountability ? `Ειδική Συνεδρίαση Λογοδοσίας ${shortDate(dateTime)}` : `${body.name} ${shortDate(dateTime)}`,
                name_en: accountability ? `Accountability Meeting ${shortDate(dateTime)}` : `${body.name_en} ${shortDate(dateTime)}`,
            });
        }
    });

    const unassignedIds: string[] = [];
    for (let index = 0; index < 4; index++) {
        const dateTime = new Date(Date.UTC(2024, 6 + index * 2, 3, 15, 0));
        const id = `unassigned-${index}`;
        unassignedIds.push(id);
        meetings.push({
            id,
            cityId,
            administrativeBodyId: null,
            dateTime,
            released: true,
            name: `Δημοτικό Συμβούλιο ${shortDate(dateTime)}`,
            name_en: `Municipal Council ${shortDate(dateTime)}`,
        });
    }
    await prisma.councilMeeting.createMany({ data: meetings });

    const subjects: Prisma.SubjectCreateManyInput[] = meetings.flatMap((meeting, meetingIndex) =>
        Array.from({ length: SUBJECTS_PER_MEETING }, (_, subjectIndex) => ({
            id: `${meeting.id}-s${subjectIndex + 1}`,
            cityId,
            councilMeetingId: meeting.id,
            name: `${SUBJECT_TOPICS[(meetingIndex + subjectIndex) % SUBJECT_TOPICS.length]} (θέμα ${subjectIndex + 1})`,
            description: "Περιγραφή θέματος",
            agendaItemIndex: subjectIndex + 1,
        })),
    );
    subjects.push({
        id: "committee-0-marker",
        cityId,
        councilMeetingId: "committee-0",
        name: ARCHIVE_MARKER_SUBJECT,
        description: "Περιγραφή θέματος",
        agendaItemIndex: SUBJECTS_PER_MEETING + 1,
    });
    await prisma.subject.createMany({ data: subjects });

    return { cityId, bodies, unassignedIds, unreleasedIds };
}
