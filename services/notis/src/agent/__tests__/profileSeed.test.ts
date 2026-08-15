import { seedProfileFromPreferences } from "../profileSeed";

describe("seedProfileFromPreferences", () => {
  test("no preferences", () => {
    expect(seedProfileFromPreferences([])).toBe("Δεν έχει δηλώσει προτιμήσεις ειδοποιήσεων.");
  });

  test("city with topics and locations", () => {
    const profile = seedProfileFromPreferences([
      {
        cityId: "athens",
        cityName: "Αθήνα",
        topics: ["Πολεοδομία", "Συγκοινωνίες"],
        locations: ["Πετράλωνα"],
      },
    ]);
    expect(profile).toBe(
      "Έχει ενεργοποιήσει ειδοποιήσεις για Αθήνα. " +
        "Θέματα που έχει επιλέξει: Πολεοδομία, Συγκοινωνίες. " +
        "Περιοχές που τον αφορούν: Πετράλωνα.",
    );
  });

  test("city without topics or locations says so explicitly", () => {
    const profile = seedProfileFromPreferences([
      { cityId: "patras", cityName: "Πάτρα", topics: [], locations: [] },
    ]);
    expect(profile).toContain("Χωρίς συγκεκριμένα θέματα ή περιοχές.");
  });

  test("multiple cities produce one line each", () => {
    const profile = seedProfileFromPreferences([
      { cityId: "a", cityName: "Αθήνα", topics: ["Πολεοδομία"], locations: [] },
      { cityId: "p", cityName: "Πάτρα", topics: [], locations: ["Ρίο"] },
    ]);
    expect(profile.split("\n")).toHaveLength(2);
  });
});
