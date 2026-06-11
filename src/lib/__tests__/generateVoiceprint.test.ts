import {
    getCandidateSegmentsForVoiceprint,
    requestGenerateVoiceprintForSegment,
} from "@/lib/actions/voiceprints";
import { computeVoiceprintWindow } from "@/lib/tasks/voiceprintWindow";

jest.mock("server-only", () => ({}));

// Mock Prisma client
const mockPrisma = {
    person: {
        findUnique: jest.fn(),
    },
    speakerSegment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
    },
    utterance: {
        findMany: jest.fn(),
    },
};

jest.mock("@/lib/db/prisma", () => ({
    __esModule: true,
    default: {
        person: {
            findUnique: (...args: unknown[]) => mockPrisma.person.findUnique(...args),
        },
        speakerSegment: {
            findUnique: (...args: unknown[]) => mockPrisma.speakerSegment.findUnique(...args),
            findMany: (...args: unknown[]) => mockPrisma.speakerSegment.findMany(...args),
        },
        utterance: {
            findMany: (...args: unknown[]) => mockPrisma.utterance.findMany(...args),
        },
    },
}));

// Mock auth module
const mockWithUserAuthorizedToEdit = jest.fn();
jest.mock("@/lib/auth", () => ({
    withUserAuthorizedToEdit: (...args: unknown[]) => mockWithUserAuthorizedToEdit(...args),
    isUserAuthorizedToEdit: jest.fn(),
}));

// Mock task dispatch
const mockStartTask = jest.fn();
jest.mock("@/lib/tasks/tasks", () => ({
    startTask: (...args: unknown[]) => mockStartTask(...args),
}));

// Mock meeting lookup
const mockGetCouncilMeeting = jest.fn();
jest.mock("@/lib/db/meetings", () => ({
    getCouncilMeeting: (...args: unknown[]) => mockGetCouncilMeeting(...args),
}));

// Mock voiceprint db helper (imported by the module under test)
jest.mock("@/lib/db/voiceprintsCreate", () => ({
    createVoicePrintDirect: jest.fn(),
}));

const PERSON_ID = "person-1";
const CITY_ID = "city-1";
const MEETING_ID = "meeting-1";
const TAG_CREATED_AT = new Date("2026-10-01T12:00:00Z");

function sourceTag(personSetBy: string, reviewDates: Date[] = []) {
    return {
        id: "tag-1",
        personId: PERSON_ID,
        personSetBy,
        createdAt: TAG_CREATED_AT,
        speakerSegments: [{ meeting: { taskStatuses: reviewDates.map(createdAt => ({ createdAt })) } }],
    };
}


beforeEach(() => {
    jest.clearAllMocks();
    mockWithUserAuthorizedToEdit.mockResolvedValue(undefined);
});

describe("getCandidateSegmentsForVoiceprint", () => {
    it("filters out short segments, sorts longest-first, and builds previews", async () => {
        mockPrisma.person.findUnique.mockResolvedValue({ cityId: CITY_ID, city: { timezone: "America/New_York" }, speakerTags: [sourceTag("user")] });
        // First pass: segment scan without transcripts.
        mockPrisma.speakerSegment.findMany.mockResolvedValue([
            {
                id: "seg-short",
                meetingId: MEETING_ID,
                cityId: CITY_ID,
                startTimestamp: 0,
                endTimestamp: 10, // 10s -> filtered out before the transcript fetch
                meeting: { name: "Meeting A", name_en: "Meeting A", dateTime: new Date("2024-01-01T00:00:00Z") },
            },
            {
                id: "seg-medium",
                meetingId: MEETING_ID,
                cityId: CITY_ID,
                startTimestamp: 100,
                endTimestamp: 145, // 45s
                meeting: {
                    name: "Meeting B",
                    name_en: "Meeting B",
                    dateTime: new Date("2024-02-01T00:00:00Z"),
                    audioUrl: null,
                    videoUrl: "https://media/meeting-b.mp4",
                },
            },
            {
                id: "seg-long",
                meetingId: MEETING_ID,
                cityId: CITY_ID,
                startTimestamp: 200,
                endTimestamp: 290, // 90s
                meeting: {
                    name: "Meeting C",
                    name_en: "Meeting C",
                    dateTime: new Date("2024-03-01T00:00:00Z"),
                    audioUrl: "https://media/meeting-c.mp3",
                    videoUrl: "https://media/meeting-c.mp4",
                },
            },
        ]);
        // Second pass: transcripts only for the surviving (longest) segments.
        // seg-medium window is [107.5, 137.5]; "intro" and "outro" fall outside it.
        mockPrisma.utterance.findMany.mockResolvedValue([
            { speakerSegmentId: "seg-long", text: "longest segment", startTimestamp: 200, endTimestamp: 290 },
            { speakerSegmentId: "seg-medium", text: "intro", startTimestamp: 100, endTimestamp: 105 },
            { speakerSegmentId: "seg-medium", text: "hello", startTimestamp: 110, endTimestamp: 120 },
            { speakerSegmentId: "seg-medium", text: "world", startTimestamp: 125, endTimestamp: 135 },
            { speakerSegmentId: "seg-medium", text: "outro", startTimestamp: 140, endTimestamp: 145 },
        ]);

        const result = await getCandidateSegmentsForVoiceprint(PERSON_ID);

        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: CITY_ID });
        // The segment scan must be scoped to the person's city so a caller can't
        // read transcript content from cities they aren't authorized for.
        expect(mockPrisma.speakerSegment.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ cityId: CITY_ID }),
            }),
        );
        expect(result.map(c => c.segmentId)).toEqual(["seg-long", "seg-medium"]);
        expect(result[0].duration).toBe(90);
        expect(result[0].meetingTimezone).toBe("America/New_York");

        // windowText is only the utterances inside the centered 30s window;
        // fullText is the whole segment
        expect(result[1].windowText).toBe("hello world");
        expect(result[1].fullText).toBe("intro hello world outro");

        // mediaUrl prefers audioUrl, falls back to videoUrl
        expect(result[0].mediaUrl).toBe("https://media/meeting-c.mp3");
        expect(result[1].mediaUrl).toBe("https://media/meeting-b.mp4");

        // preview window matches the 30s window the voiceprint job will consume
        expect(result[0].previewStartTimestamp).toBe(230);
        expect(result[0].previewEndTimestamp).toBe(260);
        expect(result[1].previewStartTimestamp).toBe(107.5);
        expect(result[1].previewEndTimestamp).toBe(137.5);
    });

    it.each([
        ["no review", []],
        ["an older review", [new Date("2026-10-01T11:59:59Z")]],
        ["a review at tag creation", [TAG_CREATED_AT]],
    ])("excludes transcript sources with %s before fetching segments or transcripts", async (_name, reviewDates) => {
        mockPrisma.person.findUnique.mockResolvedValue({
            cityId: CITY_ID,
            city: { timezone: "Europe/Athens" },
            speakerTags: [sourceTag("transcript", reviewDates as Date[])],
        });

        await expect(getCandidateSegmentsForVoiceprint(PERSON_ID)).resolves.toEqual([]);
        expect(mockPrisma.speakerSegment.findMany).not.toHaveBeenCalled();
        expect(mockPrisma.utterance.findMany).not.toHaveBeenCalled();
    });

    it.each([
        ["a reviewed transcript source", "transcript", [new Date("2026-10-01T12:00:01Z")]],
        ["a reviewer-assigned source without a review", "user", []],
        ["a voiceprint source without a review", "voiceprint", []],
        ["a jointly assigned source without a review", "both", []],
    ])("lists only eligible tag IDs for %s", async (_name, personSetBy, reviewDates) => {
        mockPrisma.person.findUnique.mockResolvedValue({
            cityId: CITY_ID,
            city: { timezone: "Europe/Athens" },
            speakerTags: [
                sourceTag(personSetBy as string, reviewDates as Date[]),
                { ...sourceTag("transcript"), id: "unreviewed-tag" },
            ],
        });
        mockPrisma.speakerSegment.findMany.mockResolvedValue([{
            id: "eligible-segment",
            meetingId: MEETING_ID,
            cityId: CITY_ID,
            startTimestamp: 0,
            endTimestamp: 60,
            meeting: { name: "Meeting", name_en: "Meeting", dateTime: TAG_CREATED_AT, audioUrl: "http://audio" },
        }]);
        mockPrisma.utterance.findMany.mockResolvedValue([]);

        const candidates = await getCandidateSegmentsForVoiceprint(PERSON_ID);

        expect(candidates.map(candidate => candidate.segmentId)).toEqual(["eligible-segment"]);
        expect(mockPrisma.speakerSegment.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                cityId: CITY_ID,
                speakerTag: { personId: PERSON_ID, id: { in: ["tag-1"] } },
            }),
        }));
    });

    it("derives candidate labels from meeting facts when legacy names are null", async () => {
        mockPrisma.person.findUnique.mockResolvedValue({
            cityId: CITY_ID, city: { timezone: "Europe/Athens" }, speakerTags: [sourceTag("user")],
        });
        mockPrisma.speakerSegment.findMany.mockResolvedValue([{
            id: "seg-1", cityId: CITY_ID, meetingId: MEETING_ID, startTimestamp: 0, endTimestamp: 60,
            meeting: {
                name: null, name_en: null, kind: "ordinary", urgent: false, sessionNumber: 3,
                administrativeBody: { name: "Συμβούλιο", name_en: "Council" },
                dateTime: TAG_CREATED_AT, audioUrl: "http://audio", videoUrl: null,
            },
        }]);
        mockPrisma.utterance.findMany.mockResolvedValue([]);

        const [candidate] = await getCandidateSegmentsForVoiceprint(PERSON_ID);

        expect(candidate.meetingName).toBe("Συμβούλιο · 3η Τακτική");
        expect(candidate.meetingNameEn).toBe("Council · 3rd Regular");
    });

    it("throws when the person does not exist", async () => {
        mockPrisma.person.findUnique.mockResolvedValue(null);
        await expect(getCandidateSegmentsForVoiceprint(PERSON_ID)).rejects.toThrow("Person not found");
    });
});

describe("computeVoiceprintWindow", () => {
    it("returns the whole segment when it is exactly the window length", () => {
        expect(computeVoiceprintWindow(100, 130)).toEqual({ startTimestamp: 100, endTimestamp: 130 });
    });

    it("centers a 30s window on the midpoint of a longer segment", () => {
        // 90s segment [200, 290] -> midpoint 245 -> [230, 260]
        expect(computeVoiceprintWindow(200, 290)).toEqual({ startTimestamp: 230, endTimestamp: 260 });
    });

    it("handles fractional bounds", () => {
        // 45s segment [100, 145] -> midpoint 122.5 -> [107.5, 137.5]
        expect(computeVoiceprintWindow(100, 145)).toEqual({ startTimestamp: 107.5, endTimestamp: 137.5 });
    });

    it("rejects invalid inputs", () => {
        expect(() => computeVoiceprintWindow(NaN, 100)).toThrow(/finite/);
        expect(() => computeVoiceprintWindow(200, 100)).toThrow(/must not exceed/);
        expect(() => computeVoiceprintWindow(0, 100, 0)).toThrow(/positive/);
    });
});

describe("requestGenerateVoiceprintForSegment", () => {
    it("rejects a stale picker submission after a reviewed tag is replaced by an unreviewed transcript tag", async () => {
        mockPrisma.person.findUnique.mockResolvedValue({
            cityId: CITY_ID,
            city: { timezone: "Europe/Athens" },
            speakerTags: [sourceTag("transcript", [new Date("2026-10-01T12:00:01Z")])],
        });
        mockPrisma.speakerSegment.findMany.mockResolvedValue([{
            id: "seg-1", cityId: CITY_ID, meetingId: MEETING_ID, startTimestamp: 0, endTimestamp: 60,
            meeting: { name: "Meeting", name_en: "Meeting", dateTime: TAG_CREATED_AT, audioUrl: "http://audio" },
        }]);
        mockPrisma.utterance.findMany.mockResolvedValue([]);
        expect(await getCandidateSegmentsForVoiceprint(PERSON_ID)).toHaveLength(1);

        mockPrisma.speakerSegment.findUnique.mockResolvedValue({
            id: "seg-1", cityId: CITY_ID, meetingId: MEETING_ID, startTimestamp: 0, endTimestamp: 60,
            speakerTag: sourceTag("transcript"),
        });

        await expect(requestGenerateVoiceprintForSegment(PERSON_ID, "seg-1")).rejects.toThrow(/requires a completed human review/);
        expect(mockGetCouncilMeeting).not.toHaveBeenCalled();
        expect(mockStartTask).not.toHaveBeenCalled();
    });

    it("allows a transcript source reviewed after its tag was created", async () => {
        mockPrisma.speakerSegment.findUnique.mockResolvedValue({
            id: "seg-1", cityId: CITY_ID, meetingId: MEETING_ID, startTimestamp: 0, endTimestamp: 60,
            speakerTag: sourceTag("transcript", [new Date("2026-10-01T12:00:01Z")]),
        });
        mockGetCouncilMeeting.mockResolvedValue({ audioUrl: "http://audio", videoUrl: null });
        mockStartTask.mockResolvedValue({ id: "task-1" });

        await expect(requestGenerateVoiceprintForSegment(PERSON_ID, "seg-1")).resolves.toEqual({ id: "task-1" });
        expect(mockStartTask).toHaveBeenCalledTimes(1);
        expect(mockPrisma.speakerSegment.findUnique).toHaveBeenCalledWith({
            where: { id: "seg-1" },
            include: { speakerTag: { select: {
                personId: true,
                personSetBy: true,
                createdAt: true,
                speakerSegments: { select: { meeting: { select: { taskStatuses: {
                    where: { type: "humanReview", status: "succeeded" },
                    select: { createdAt: true },
                } } } } },
            } } },
        });
    });

    it("rejects a foreign person's segment even when the segment's city is authorized", async () => {
        mockPrisma.speakerSegment.findUnique.mockResolvedValue({
            id: "seg-1",
            cityId: CITY_ID,
            meetingId: MEETING_ID,
            startTimestamp: 0,
            endTimestamp: 60,
            speakerTag: sourceTag("user"),
        });
        mockGetCouncilMeeting.mockResolvedValue({ audioUrl: "http://audio", videoUrl: null });
        mockStartTask.mockResolvedValue({ id: "task-1" });
        mockWithUserAuthorizedToEdit.mockImplementation(async (scope: { personId?: string }) => {
            if (scope.personId === PERSON_ID) {
                throw new Error("Not authorized");
            }
        });

        await expect(requestGenerateVoiceprintForSegment(PERSON_ID, "seg-1")).rejects.toThrow("Not authorized");
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ personId: PERSON_ID });
        expect(mockGetCouncilMeeting).not.toHaveBeenCalled();
        expect(mockStartTask).not.toHaveBeenCalled();
    });

    it("rejects an unauthorized segment city even when the person is authorized", async () => {
        mockPrisma.speakerSegment.findUnique.mockResolvedValue({
            id: "seg-1",
            cityId: "foreign-city",
            meetingId: MEETING_ID,
            startTimestamp: 0,
            endTimestamp: 60,
            speakerTag: sourceTag("user"),
        });
        mockGetCouncilMeeting.mockResolvedValue({ audioUrl: "http://audio", videoUrl: null });
        mockStartTask.mockResolvedValue({ id: "task-1" });
        mockWithUserAuthorizedToEdit.mockImplementation(async (scope: { cityId?: string }) => {
            if (scope.cityId === "foreign-city") {
                throw new Error("Not authorized");
            }
        });

        await expect(requestGenerateVoiceprintForSegment(PERSON_ID, "seg-1")).rejects.toThrow("Not authorized");
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ personId: PERSON_ID });
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: "foreign-city" });
        expect(mockGetCouncilMeeting).not.toHaveBeenCalled();
        expect(mockStartTask).not.toHaveBeenCalled();
    });

    it("rejects a segment that does not belong to the person", async () => {
        mockPrisma.speakerSegment.findUnique.mockResolvedValue({
            id: "seg-1",
            cityId: CITY_ID,
            meetingId: MEETING_ID,
            startTimestamp: 0,
            endTimestamp: 60,
            speakerTag: { personId: "someone-else" },
        });

        await expect(requestGenerateVoiceprintForSegment(PERSON_ID, "seg-1")).rejects.toThrow(
            "The selected segment does not belong to this person",
        );
        expect(mockStartTask).not.toHaveBeenCalled();
    });

    it("rejects a segment that is too short", async () => {
        mockPrisma.speakerSegment.findUnique.mockResolvedValue({
            id: "seg-1",
            cityId: CITY_ID,
            meetingId: MEETING_ID,
            startTimestamp: 0,
            endTimestamp: 10, // 10s < 30s
            speakerTag: sourceTag("user"),
        });

        await expect(requestGenerateVoiceprintForSegment(PERSON_ID, "seg-1")).rejects.toThrow(/too short/);
        expect(mockStartTask).not.toHaveBeenCalled();
    });

    it("dispatches a task with a 30s window centered on the segment midpoint", async () => {
        mockPrisma.speakerSegment.findUnique.mockResolvedValue({
            id: "seg-1",
            cityId: CITY_ID,
            meetingId: MEETING_ID,
            startTimestamp: 100,
            endTimestamp: 200, // 100s, midpoint 150
            speakerTag: sourceTag("user"),
        });
        mockGetCouncilMeeting.mockResolvedValue({ audioUrl: "http://audio", videoUrl: null });
        mockStartTask.mockResolvedValue({ id: "task-1" });

        const task = await requestGenerateVoiceprintForSegment(PERSON_ID, "seg-1");

        expect(task).toEqual({ id: "task-1" });
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ personId: PERSON_ID });
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: CITY_ID });
        expect(mockStartTask).toHaveBeenCalledWith(
            "generateVoiceprint",
            expect.objectContaining({
                mediaUrl: "http://audio",
                personId: PERSON_ID,
                segmentId: "seg-1",
                startTimestamp: 135, // 150 - 15
                endTimestamp: 165, // 135 + 30
                cityId: CITY_ID,
            }),
            MEETING_ID,
            CITY_ID,
        );
    });
});
