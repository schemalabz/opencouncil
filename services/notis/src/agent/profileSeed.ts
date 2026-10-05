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
    return "Δεν έχει δηλώσει προτιμήσεις ενημερώσεων.";
  }
  return cities
    .map((city) => {
      const parts = [`Έχει ενεργοποιήσει ενημερώσεις για ${city.cityName}.`];
      if (city.topics.length > 0) {
        parts.push(`Θέματα που έχει επιλέξει: ${city.topics.join(", ")}.`);
      }
      if (city.locations.length > 0) {
        parts.push(`Περιοχές που τον αφορούν: ${city.locations.map(locationText).join(", ")}.`);
      }
      // An empty topic list is not «no interests»: the signup calls topics
      // optional hints and its summary says «Όλα τα θέματα». Seeded as «no
      // specific topics», the model read it as a reason for silence 69 times.
      if (city.topics.length === 0) {
        parts.push("Δεν περιόρισε θέματα: όλα τα θέματα του δήμου τον αφορούν.");
      }
      if (city.locations.length === 0) {
        parts.push("Χωρίς συγκεκριμένες περιοχές.");
      }
      return parts.join(" ");
    })
    .join("\n");
}
