import { locationText } from "./geo";
import { CityPreference } from "./types";

/**
 * The mechanical profile-seeding rule: notification preferences → the initial
 * taste-profile text. One rule, two callers — the playground seeds simulated
 * users with it so tuning runs on the launch population, and PR 6's migration
 * enrollment seeds real subscriptions with it. Seeded once; from then on the
 * profile is agent-owned and preferences are never re-applied on top.
 */
export function seedProfileFromPreferences(cities: CityPreference[]): string {
  if (cities.length === 0) {
    return "Δεν έχει δηλώσει προτιμήσεις ειδοποιήσεων.";
  }
  return cities
    .map((city) => {
      const parts = [`Έχει ενεργοποιήσει ειδοποιήσεις για ${city.cityName}.`];
      if (city.topics.length > 0) {
        parts.push(`Θέματα που έχει επιλέξει: ${city.topics.join(", ")}.`);
      }
      if (city.locations.length > 0) {
        parts.push(`Περιοχές που τον αφορούν: ${city.locations.map(locationText).join(", ")}.`);
      }
      if (city.topics.length === 0 && city.locations.length === 0) {
        parts.push("Χωρίς συγκεκριμένα θέματα ή περιοχές.");
      }
      return parts.join(" ");
    })
    .join("\n");
}
