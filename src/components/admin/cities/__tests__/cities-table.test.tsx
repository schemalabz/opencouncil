import React from "react";
import { render, screen } from "@testing-library/react";
import { City, CityStatus, Realm } from "@prisma/client";
import { CitiesAdminTable } from "../cities-table";

// Translations render as their keys; realm labels come from Intl.DisplayNames
// via useLocale, so pin the locale to make them assertable.
jest.mock("next-intl", () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => "en",
}));
// The row expander embeds the full city form; irrelevant to grouping.
jest.mock("@/components/cities/CityForm", () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock("@/components/FormSheet", () => ({
    __esModule: true,
    default: () => null,
}));

type CityRow = City & { _count: { persons: number; parties: number; councilMeetings: number } };

function makeCity(overrides: Partial<CityRow> & Pick<CityRow, "id" | "name" | "name_en" | "realm">): CityRow {
    return {
        name_municipality: overrides.name,
        name_municipality_en: overrides.name_en,
        logoImage: null,
        timezone: "Europe/Athens",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        officialSupport: false,
        status: "listed" as CityStatus,
        authorityType: "municipality",
        wikipediaId: null,
        supportsNotifications: false,
        consultationsEnabled: false,
        peopleOrdering: "default",
        highlightCreationPermission: "ADMINS_ONLY",
        diavgeiaUid: null,
        language: "el",
        population: null,
        _count: { persons: 0, parties: 0, councilMeetings: 0 },
        ...overrides,
    };
}

describe("CitiesAdminTable realm grouping", () => {
    // One city per realm: every realm in the enum must surface in the table —
    // a city must never vanish because the UI's realm list lags the enum.
    const cities = (Object.values(Realm) as Realm[]).map((realm) =>
        makeCity({
            id: `${realm}-city`,
            name: `Πόλη ${realm}`,
            name_en: `City of ${realm}`,
            realm,
        }),
    );

    it("renders a group with a distinct label for every realm", () => {
        render(<CitiesAdminTable cities={cities} />);
        for (const realm of Object.values(Realm)) {
            expect(screen.getByText(`Πόλη ${realm}`)).toBeInTheDocument();
        }
        // Labels are distinct per realm (a cyprus group must not fall back to
        // the greece label). Names come from Intl.DisplayNames in the mocked
        // en locale.
        expect(screen.getByText("Greece")).toBeInTheDocument();
        expect(screen.getByText("France")).toBeInTheDocument();
        expect(screen.getByText("Cyprus")).toBeInTheDocument();
    });
});
