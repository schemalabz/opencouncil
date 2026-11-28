import React from "react";
import { render, screen } from "@testing-library/react";
import { City, CityStatus, Realm } from "@prisma/client";
import { CitiesAdminTable } from "../cities-table";
import { ALL_REALMS, getRealmBaseUrl } from "@/lib/realm";

// Translations render as their keys, and a count follows its key; realm labels
// come from Intl.DisplayNames via useLocale, so pin the locale to make them
// assertable.
jest.mock("next-intl", () => ({
    useTranslations: () => (key: string, values?: { count?: number }) =>
        values?.count === undefined ? key : `${key}:${values.count}`,
    useLocale: () => "en",
}));
// The row expander embeds the full city form; irrelevant to grouping.
jest.mock("@/components/cities/CityForm", () => ({
    __esModule: true,
    default: () => null,
}));
// The sheet shows only its title here.
jest.mock("@/components/FormSheet", () => ({
    __esModule: true,
    default: ({ title }: { title: string }) => <span>{title}</span>,
}));
// The QR strips button fetches and renders a PDF; irrelevant to grouping.
jest.mock("@/components/admin/cities/CouncilQrStripsButton", () => ({
    CouncilQrStripsButton: () => null,
}));

const productionBaseUrls = Object.fromEntries(
    ALL_REALMS.map((realm) => [realm, getRealmBaseUrl(realm)]),
) as Record<Realm, string>;

type CityRow = City & { _count: { persons: number; parties: number; councilMeetings: number } };

function makeCity(overrides: Partial<CityRow> & Pick<CityRow, "id" | "name" | "name_en" | "realm">): CityRow {
    return {
        name_municipality: overrides.name,
        name_municipality_en: overrides.name_en,
        logoImage: null,
        timezone: "Europe/Athens",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        status: "demo" as CityStatus,
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
        render(<CitiesAdminTable cities={cities} realmBaseUrls={productionBaseUrls} />);
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

    it("links each city to its own realm's domain", () => {
        render(<CitiesAdminTable cities={cities} realmBaseUrls={productionBaseUrls} />);
        expect(screen.getByText("greece-city").closest("a")).toHaveAttribute("href", "https://opencouncil.gr/greece-city");
        expect(screen.getByText("france-city").closest("a")).toHaveAttribute("href", "https://opencouncil.fr/france-city");
    });

    it("names the realm when every realm shares one preview host", () => {
        const previewBaseUrls = Object.fromEntries(
            ALL_REALMS.map((realm) => [realm, "https://pr-7.opencouncil.dev"]),
        ) as Record<Realm, string>;
        render(<CitiesAdminTable cities={cities} realmBaseUrls={previewBaseUrls} />);
        expect(screen.getByText("france-city").closest("a")).toHaveAttribute(
            "href",
            "https://pr-7.opencouncil.dev/france-city?realm=france",
        );
    });
});

describe("CitiesAdminTable authority kinds (#993)", () => {
    const athens = makeCity({ id: "athens", name: "Αθήνα", name_en: "Athens", realm: "greece" });
    const thessaly = makeCity({ id: "thessalia", name: "Θεσσαλία", name_en: "Thessaly", realm: "greece", authorityType: "region" });

    it("counts the municipalities and the regions of a realm apart", () => {
        render(<CitiesAdminTable cities={[athens, thessaly]} realmBaseUrls={productionBaseUrls} />);
        expect(screen.getByText("cityCount:1")).toBeInTheDocument();
        expect(screen.getByText("regionCount:1")).toBeInTheDocument();
    });

    it("shows no region count for a realm that has no region", () => {
        render(<CitiesAdminTable cities={[athens]} realmBaseUrls={productionBaseUrls} />);
        expect(screen.getByText("cityCount:1")).toBeInTheDocument();
        expect(screen.queryByText(/^regionCount/)).not.toBeInTheDocument();
    });

    it("shows no municipality count for a realm that has only regions", () => {
        render(<CitiesAdminTable cities={[thessaly]} realmBaseUrls={productionBaseUrls} />);
        expect(screen.getByText("regionCount:1")).toBeInTheDocument();
        expect(screen.queryByText(/^cityCount/)).not.toBeInTheDocument();
    });

    it("names the kind of the authority in the title of the edit sheet", () => {
        render(<CitiesAdminTable cities={[athens, thessaly]} realmBaseUrls={productionBaseUrls} />);
        expect(screen.getByText("editCity.municipality")).toBeInTheDocument();
        expect(screen.getByText("editCity.region")).toBeInTheDocument();
    });
});
