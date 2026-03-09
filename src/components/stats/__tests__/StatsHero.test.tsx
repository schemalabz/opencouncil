import React from "react";
import { render, screen } from "@testing-library/react";
import { StatsHero } from "../StatsHero";

// Mock framer-motion
jest.mock("framer-motion", () => ({
    motion: {
        h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) =>
            React.createElement("h1", props, children),
        p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) =>
            React.createElement("p", props, children),
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
            React.createElement("div", props, children),
    },
}));

// Mock NumberTicker to render value directly
jest.mock("@/components/magicui/number-ticker", () => ({
    __esModule: true,
    default: function MockNumberTicker({ value }: { value: number }) {
        return React.createElement("span", { "data-testid": "ticker" }, value.toString());
    },
}));

// Mock FloatingPathsBackground
jest.mock("@/components/ui/floating-paths", () => ({
    FloatingPathsBackground: () => null,
}));

describe("StatsHero", () => {
    const kpis = {
        cityCount: 42,
        meetingCount: 210,
        hoursTranscribed: 1500,
        wordCount: 980000,
        speakerCount: 330,
    };

    it("renders all 5 counters with provided data", () => {
        render(<StatsHero kpis={kpis} />);

        expect(screen.getByTestId("counter-cityCount")).toBeDefined();
        expect(screen.getByTestId("counter-meetingCount")).toBeDefined();
        expect(screen.getByTestId("counter-hoursTranscribed")).toBeDefined();
        expect(screen.getByTestId("counter-wordCount")).toBeDefined();
        expect(screen.getByTestId("counter-speakerCount")).toBeDefined();
    });

    it("has an accessible hero section", () => {
        render(<StatsHero kpis={kpis} />);
        expect(screen.getByTestId("stats-hero")).toBeDefined();
    });

    it("renders labels for each metric", () => {
        render(<StatsHero kpis={kpis} />);

        expect(screen.getByText("Δήμοι")).toBeDefined();
        expect(screen.getByText("Συνεδριάσεις")).toBeDefined();
        expect(screen.getByText("Ώρες")).toBeDefined();
        expect(screen.getByText("Λέξεις")).toBeDefined();
        expect(screen.getByText("Ομιλητές")).toBeDefined();
    });
});
