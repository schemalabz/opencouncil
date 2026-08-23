import { distanceLine, formatDistance, haversineMeters, locationCoords, locationText } from "../geo";

describe("locationText / locationCoords", () => {
  test("bare strings (PR 1 shape) have text and no coordinates", () => {
    expect(locationText("Πετράλωνα")).toBe("Πετράλωνα");
    expect(locationCoords("Πετράλωνα")).toBeNull();
  });

  test("object form carries coordinates", () => {
    const l = { text: "Πετράλωνα", lng: 23.708, lat: 37.968 };
    expect(locationText(l)).toBe("Πετράλωνα");
    expect(locationCoords(l)).toEqual({ lng: 23.708, lat: 37.968 });
  });

  test("missing or (0,0) sentinel coordinates count as none", () => {
    expect(locationCoords({ text: "x" })).toBeNull();
    expect(locationCoords({ text: "x", lng: 0, lat: 0 })).toBeNull();
  });
});

describe("haversineMeters", () => {
  test("Πετράλωνα to Σύνταγμα is about 2.6 km", () => {
    const d = haversineMeters({ lng: 23.708, lat: 37.968 }, { lng: 23.735, lat: 37.9755 });
    expect(d).toBeGreaterThan(2200);
    expect(d).toBeLessThan(2800);
  });
});

describe("formatDistance", () => {
  test("meters round to 50, kilometers to one decimal, far to whole", () => {
    expect(formatDistance(430)).toBe("450 μ");
    expect(formatDistance(20)).toBe("50 μ");
    expect(formatDistance(2140)).toBe("2,1 χλμ");
    // 980 rounds to 1000 — must switch to the km form, never «1000 μ».
    expect(formatDistance(980)).toBe("1,0 χλμ");
    expect(formatDistance(12400)).toBe("12 χλμ");
  });
});

describe("distanceLine", () => {
  test("one entry per reader place", () => {
    const line = distanceLine({ lng: 23.708, lat: 37.968 }, [
      { text: "Σπίτι", lng: 23.712, lat: 37.97 },
      { text: "Δουλειά", lng: 23.735, lat: 37.9755 },
    ]);
    expect(line).toMatch(/από «Σπίτι» · /);
    expect(line).toMatch(/χλμ από «Δουλειά»/);
  });

  test("null without reader places", () => {
    expect(distanceLine({ lng: 23.7, lat: 37.9 }, [])).toBeNull();
  });
});
