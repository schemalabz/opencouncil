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
        { cityId: "c1", cityName: "Αθήνα", totalSeconds: 360000, meetingCount: 100 },
        { cityId: "c2", cityName: "Θεσσαλονίκη", totalSeconds: 180000, meetingCount: 50 },
        { cityId: "c3", cityName: "Πάτρα", totalSeconds: 90000, meetingCount: 25 },
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

        // 360000 / 3600 = 100 hours
        expect(screen.getByText(/100h/)).toBeDefined();
        expect(screen.getByText(/100 συν\./)).toBeDefined();
    });

    it("renders the section heading", () => {
        render(<CityLeaderboard cities={cities} />);
        expect(screen.getByText("Κατάταξη Δήμων")).toBeDefined();
    });
});
