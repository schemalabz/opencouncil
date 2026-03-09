import React from "react";
import { render, screen } from "@testing-library/react";
import { TopicPartyRings } from "../TopicPartyRings";

// Mock ColorPercentageRing as it renders SVGs
jest.mock("@/components/ui/color-percentage-ring", () => ({
    ColorPercentageRing: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", { "data-testid": "mock-ring" }, children),
}));

describe("TopicPartyRings", () => {
    const topics = [
        { topicId: "t1", topicName: "Περιβάλλον", colorHex: "#22c55e", speakingSeconds: 600, percentage: 60 },
        { topicId: "t2", topicName: "Υγεία", colorHex: "#3b82f6", speakingSeconds: 400, percentage: 40 },
    ];
    const parties = [
        { partyId: "p1", partyName: "ΝΔ", colorHex: "#1e40af", speakingSeconds: 700, percentage: 70 },
        { partyId: "p2", partyName: "ΠΑΣΟΚ", colorHex: "#16a34a", speakingSeconds: 300, percentage: 30 },
    ];

    it("renders topics ring with correct items", () => {
        render(<TopicPartyRings topics={topics} parties={parties} />);

        expect(screen.getByTestId("topics-ring")).toBeDefined();
        expect(screen.getByText("Περιβάλλον")).toBeDefined();
        expect(screen.getByText("Υγεία")).toBeDefined();
    });

    it("renders parties ring with correct items", () => {
        render(<TopicPartyRings topics={topics} parties={parties} />);

        expect(screen.getByTestId("parties-ring")).toBeDefined();
        expect(screen.getByText("ΝΔ")).toBeDefined();
        expect(screen.getByText("ΠΑΣΟΚ")).toBeDefined();
    });

    it("displays percentages", () => {
        render(<TopicPartyRings topics={topics} parties={parties} />);

        expect(screen.getAllByText("60%").length).toBeGreaterThan(0);
        expect(screen.getAllByText("40%").length).toBeGreaterThan(0);
        expect(screen.getAllByText("70%").length).toBeGreaterThan(0);
        expect(screen.getAllByText("30%").length).toBeGreaterThan(0);
    });
});
