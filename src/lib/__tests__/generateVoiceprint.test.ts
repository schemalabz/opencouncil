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
import { computeVoiceprintWindow } from "../tasks/voiceprintWindow";

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
        expect(result.map(c => c.segmentId)).toEqual(["seg-long", "seg-medium"]);
        expect(result[0].duration).toBe(90);

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
