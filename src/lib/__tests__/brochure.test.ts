import { bodyTypesPhrase, coveredBodyTypesByCity } from "../brochure";
import type { CoverageRow } from "../db/coverage";

describe("bodyTypesPhrase", () => {
    it("names a single covered body", () => {
        expect(bodyTypesPhrase(["council"])).toEqual({
            subject: "Δημοτικά συμβούλια",
            feminine: false,
        });
    });

    it("joins two bodies with και", () => {
        expect(bodyTypesPhrase(["council", "community"])).toEqual({
            subject: "Δημοτικά συμβούλια και κοινότητες",
            feminine: false,
        });
    });

    it("lists all three like the generic phrase", () => {
        expect(bodyTypesPhrase(["council", "committee", "community"]).subject).toBe(
            "Δημοτικά συμβούλια, επιτροπές και κοινότητες"
        );
    });

    it("orders bodies canonically regardless of input order", () => {
        expect(bodyTypesPhrase(["community", "council"]).subject).toBe(
            "Δημοτικά συμβούλια και κοινότητες"
        );
    });

    it("is feminine (Δημοτικές) when συμβούλια are not covered", () => {
        expect(bodyTypesPhrase(["committee", "community"])).toEqual({
            subject: "Δημοτικές επιτροπές και κοινότητες",
            feminine: true,
        });
        expect(bodyTypesPhrase(["community"])).toEqual({
            subject: "Δημοτικές κοινότητες",
            feminine: true,
        });
    });
});

describe("coveredBodyTypesByCity", () => {
    it("groups and orders coverage rows per city", () => {
        const row = (cityId: string, bodyType: CoverageRow["bodyType"]): CoverageRow => ({
            cityId,
            cityName: cityId,
            cityTimezone: "Europe/Athens",
            bodyType,
            fromDate: "2026-01-01T00:00:00.000Z",
        });
        expect(
            coveredBodyTypesByCity([
                row("athens", "community"),
                row("athens", "council"),
                row("chania", "council"),
            ])
        ).toEqual({
            athens: ["council", "community"],
            chania: ["council"],
        });
    });
});
