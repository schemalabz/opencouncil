import React from "react";
import { render, screen } from "@testing-library/react";
import { CityLeaderboard } from "../CityLeaderboard";

// Mock framer-motion
jest.mock("framer-motion", () => ({
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
            React.createElement("div", props, children),
    },
}));

describe("CityLeaderboard", () => {
    const cities = [
        { cityId: "c1", cityName: "Αθήνα", totalSeconds: 540000, meetingCount: 100 },
        { cityId: "c2", cityName: "Θεσσαλονίκη", totalSeconds: 270000, meetingCount: 50 },
        { cityId: "c3", cityName: "Πάτρα", totalSeconds: 108000, meetingCount: 25 },
    ];

    it("renders cities in order", () => {
        render(<CityLeaderboard cities={cities} />);

        const items = screen.getAllByTestId(/^leaderboard-city-/);
        expect(items.length).toBe(3);
        expect(items[0]).toHaveTextContent("Αθήνα");
        expect(items[1]).toHaveTextContent("Θεσσαλονίκη");
        expect(items[2]).toHaveTextContent("Πάτρα");
    });

    it("shows hours and meeting count for each city", () => {
        render(<CityLeaderboard cities={cities} />);

        // 540000 / 3600 = 150 hours, meetingCount = 100 (distinct values)
        expect(screen.getByText(/150h/)).toBeDefined();
        expect(screen.getByText(/100 συν\./)).toBeDefined();
    });

    it("renders the section heading", () => {
        render(<CityLeaderboard cities={cities} />);
        expect(screen.getByText("Κατάταξη Δήμων")).toBeDefined();
    });
});
