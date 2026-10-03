import { act, renderHook, waitFor } from "@testing-library/react";
import type { CityWithGeometry } from "@/lib/db/cities";

// One translate function for every render, like next-intl's: the hook's effects depend on it.
jest.mock("next-intl", () => {
    const t = (key: string) => key;
    return { useTranslations: () => t };
});
// No debounce in tests: the search runs on the next render.
jest.mock("@/hooks/use-debounce", () => ({ useDebounce: <T,>(value: T) => value }));
jest.mock("@/lib/realm", () => ({ getRealmGeocoding: () => ({ country: "GR", language: "el" }) }));
jest.mock("@/lib/google-maps", () => ({ getPlaceSuggestions: jest.fn(), getPlaceDetails: jest.fn() }));

import { getPlaceDetails, getPlaceSuggestions } from "@/lib/google-maps";
import { usePlaceSearch } from "../usePlaceSearch";

const suggestions = getPlaceSuggestions as jest.Mock;
const details = getPlaceDetails as jest.Mock;
const city = { name: "Παπάγος - Χολαργός", realm: "greece", geometry: null } as unknown as CityWithGeometry;
const voutsina = { id: "s1", placeId: "p1", text: "Βουτσινά 41, Χολαργός" };

beforeEach(() => jest.clearAllMocks());

describe("usePlaceSearch", () => {
    it("searches from the third character and exposes the suggestions", async () => {
        suggestions.mockResolvedValue({ data: [voutsina] });
        const { result } = renderHook(() => usePlaceSearch(city));

        act(() => result.current.changeInput("Βο"));
        expect(suggestions).not.toHaveBeenCalled();

        act(() => result.current.changeInput("Βουτσινά"));
        await waitFor(() => expect(result.current.suggestions).toEqual([voutsina]));
        expect(suggestions).toHaveBeenCalledWith("Βουτσινά", city.name, undefined, { country: "GR", language: "el" });
        expect(result.current.isBusy).toBe(false);
    });

    it("says the search is unavailable when Google denies the request", async () => {
        suggestions.mockResolvedValue({ data: [], error: { type: "API_ERROR", status: "REQUEST_DENIED", message: "expired" } });
        const { result } = renderHook(() => usePlaceSearch(city));

        act(() => result.current.changeInput("Βουτσινά"));
        await waitFor(() => expect(result.current.error).toBe("locationSearchUnavailable"));
    });

    it("resolves a suggestion to a point and clears the search", async () => {
        suggestions.mockResolvedValue({ data: [voutsina] });
        details.mockResolvedValue({ text: "Βουτσινά 41, Χολαργός 155 61", coordinates: [23.79, 37.99] });
        const { result } = renderHook(() => usePlaceSearch(city));
        act(() => result.current.changeInput("Βουτσινά"));
        await waitFor(() => expect(result.current.suggestions).toHaveLength(1));

        let location: Awaited<ReturnType<typeof result.current.select>> = null;
        await act(async () => { location = await result.current.select(voutsina); });

        expect(location).toEqual({ text: "Βουτσινά 41, Χολαργός 155 61", coordinates: [23.79, 37.99] });
        expect(result.current.inputValue).toBe("");
        expect(result.current.suggestions).toEqual([]);
    });

    it("returns nothing and explains when the place has no details", async () => {
        details.mockResolvedValue(null);
        const { result } = renderHook(() => usePlaceSearch(city));

        let location: Awaited<ReturnType<typeof result.current.select>> = { text: "", coordinates: [0, 0] };
        await act(async () => { location = await result.current.select(voutsina); });

        expect(location).toBeNull();
        expect(result.current.error).toBe("locationDetailsUnavailable");
    });
});
