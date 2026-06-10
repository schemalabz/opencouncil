// Mock Prisma client
const mockPrisma = {
    person: {
        findUnique: jest.fn(),
    },
    speakerSegment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
    },
};

jest.mock("../db/prisma", () => ({
    __esModule: true,
    default: mockPrisma,
}));

// Mock auth module
const mockWithUserAuthorizedToEdit = jest.fn();
jest.mock("../auth", () => ({
    withUserAuthorizedToEdit: (...args: unknown[]) => mockWithUserAuthorizedToEdit(...args),
    isUserAuthorizedToEdit: jest.fn(),
}));

// Mock task dispatch
const mockStartTask = jest.fn();
jest.mock("../tasks/tasks", () => ({
    startTask: (...args: unknown[]) => mockStartTask(...args),
}));

// Mock meeting lookup
const mockGetCouncilMeeting = jest.fn();
jest.mock("../db/meetings", () => ({
    getCouncilMeeting: (...args: unknown[]) => mockGetCouncilMeeting(...args),
}));

// Mock voiceprint db helper (imported by the module under test)
jest.mock("@/lib/db/voiceprints", () => ({
    createVoicePrint: jest.fn(),
}));

import {
    getCandidateSegmentsForVoiceprint,
    requestGenerateVoiceprintForSegment,
} from "../tasks/generateVoiceprint";

const PERSON_ID = "person-1";
const CITY_ID = "city-1";
const MEETING_ID = "meeting-1";

beforeEach(() => {
    jest.clearAllMocks();
    mockWithUserAuthorizedToEdit.mockResolvedValue(undefined);
});

describe("getCandidateSegmentsForVoiceprint", () => {
    it("filters out short segments, sorts longest-first, and builds previews", async () => {
        mockPrisma.person.findUnique.mockResolvedValue({ cityId: CITY_ID });
        mockPrisma.speakerSegment.findMany.mockResolvedValue([
            {
                id: "seg-short",
                meetingId: MEETING_ID,
                cityId: CITY_ID,
                startTimestamp: 0,
                endTimestamp: 10, // 10s -> filtered out
                meeting: { name: "Meeting A", name_en: "Meeting A", dateTime: new Date("2024-01-01T00:00:00Z") },
                utterances: [{ text: "too short" }],
            },
            {
                id: "seg-medium",
                meetingId: MEETING_ID,
                cityId: CITY_ID,
                startTimestamp: 100,
                endTimestamp: 145, // 45s
                meeting: { name: "Meeting B", name_en: "Meeting B", dateTime: new Date("2024-02-01T00:00:00Z") },
                utterances: [{ text: "hello" }, { text: "world" }],
            },
            {
                id: "seg-long",
                meetingId: MEETING_ID,
                cityId: CITY_ID,
                startTimestamp: 200,
                endTimestamp: 290, // 90s
                meeting: { name: "Meeting C", name_en: "Meeting C", dateTime: new Date("2024-03-01T00:00:00Z") },
                utterances: [{ text: "longest segment" }],
            },
        ]);

        const result = await getCandidateSegmentsForVoiceprint(PERSON_ID);

        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: CITY_ID });
        expect(result.map(c => c.segmentId)).toEqual(["seg-long", "seg-medium"]);
        expect(result[0].duration).toBe(90);
        expect(result[1].textPreview).toBe("hello world");
    });

    it("throws when the person does not exist", async () => {
        mockPrisma.person.findUnique.mockResolvedValue(null);
        await expect(getCandidateSegmentsForVoiceprint(PERSON_ID)).rejects.toThrow("Person not found");
    });
});

describe("requestGenerateVoiceprintForSegment", () => {
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
            speakerTag: { personId: PERSON_ID },
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
            speakerTag: { personId: PERSON_ID },
        });
        mockGetCouncilMeeting.mockResolvedValue({ audioUrl: "http://audio", videoUrl: null });
        mockStartTask.mockResolvedValue({ id: "task-1" });

        const task = await requestGenerateVoiceprintForSegment(PERSON_ID, "seg-1");

        expect(task).toEqual({ id: "task-1" });
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
