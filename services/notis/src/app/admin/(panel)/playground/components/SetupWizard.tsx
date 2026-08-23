"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { locationPoints, locationText } from "@/agent/geo";
import { seedProfileFromPreferences } from "@/agent/profileSeed";
import { EnrollmentOrigin, introTemplateFor, renderTemplate } from "@/agent/templates";
import { CityPreference, WakeState } from "@/agent/types";
import {
  CityOption,
  RealUser,
  TopicOption,
  fetchCities,
  fetchMeetings,
  fetchRealUsers,
  fetchTopics,
  geocode,
} from "../api";
import { MeetingSummary, deriveQueue } from "../deriveQueue";
import { UserAvatar } from "../../_components/UserAvatar";
import { Sim } from "../types";
import { AddressSearch } from "./AddressSearch";
import { LocationsMap, MapFocus } from "./LocationsMap";

interface Props {
  mapboxToken: string | undefined;
  onComplete(sim: Sim, from: string): void;
}

// Map pins are DERIVED from `locations` via locationPoints() — no parallel
// array to keep in sync.
interface CityDraft extends CityPreference {
  center: MapFocus | null;
  logo?: string | null;
}

const DEFAULT_PROFILE =
  "Μένει στην πόλη χρόνια. Ενδιαφέρεται για όσα αλλάζουν την καθημερινότητά της.";

function SectionHeader({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="font-relative text-3xl leading-none text-muted-foreground/40">{n}</span>
      <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      <div className="h-px flex-1 self-center bg-border" />
    </div>
  );
}

export function SetupWizard({ mapboxToken, onComplete }: Props) {
  const [cities, setCities] = useState<CityOption[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [citySearch, setCitySearch] = useState("");
  const [drafts, setDrafts] = useState<CityDraft[]>([]);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [name, setName] = useState("Μαρία");
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  // Until the admin edits the textarea, the profile tracks the mechanical
  // seeding rule — the same one migration enrollment uses — so tuning runs
  // on launch-shaped profiles, not hand-typed ones.
  const [profileDirty, setProfileDirty] = useState(false);
  const [origin, setOrigin] = useState<EnrollmentOrigin>("transition");
  const [from, setFrom] = useState("2026-05-01");

  const [realUsers, setRealUsers] = useState<{ available: boolean; users: RealUser[] } | null>(null);
  const [realMode, setRealMode] = useState(false);
  const [realLoading, setRealLoading] = useState(false);
  const [realSearch, setRealSearch] = useState("");
  const [selectedRealUserId, setSelectedRealUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchCities().then(setCities).catch((e) => setError(String(e)));
    fetchTopics().then(setTopics).catch((e) => setError(String(e)));
  }, []);

  // Real users load lazily when the mode opens, and the search runs
  // server-side (debounced) — the server caps at 50 users, so a client-side
  // filter would silently search a window.
  useEffect(() => {
    if (!realMode) return;
    setRealLoading(true);
    const timer = setTimeout(() => {
      fetchRealUsers(realSearch.trim())
        .then(setRealUsers)
        .catch(() => setRealUsers({ available: false, users: [] }))
        .finally(() => setRealLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [realMode, realSearch]);

  useEffect(() => {
    if (profileDirty) return;
    setProfile(
      drafts.length === 0
        ? DEFAULT_PROFILE
        : seedProfileFromPreferences(drafts.map(({ center: _c, logo: _l, ...pref }) => pref)),
    );
  }, [drafts, profileDirty]);

  const availableCities = useMemo(
    () =>
      cities
        .filter((c) => !drafts.some((d) => d.cityId === c.id))
        .filter((c) => c.name.toLowerCase().includes(citySearch.toLowerCase())),
    [cities, citySearch, drafts],
  );

  const allPoints = useMemo(() => drafts.flatMap((d) => locationPoints(d.locations)), [drafts]);

  async function addCity(c: CityOption) {
    setCitySearch("");
    const draft: CityDraft = {
      cityId: c.id,
      cityName: c.name,
      topics: [],
      locations: [],
      center: null,
      logo: c.logoImage ?? null,
    };
    setDrafts((prev) => [...prev, draft]);
    const hits = await geocode(c.name, mapboxToken, undefined, "place,locality");
    const center = hits[0] ? { lng: hits[0].lng, lat: hits[0].lat, zoom: 11.5 } : null;
    if (center) {
      setDrafts((prev) => prev.map((d) => (d.cityId === c.id ? { ...d, center } : d)));
      setFocus(center);
    }
  }

  function updateDraft(cityId: string, fn: (d: CityDraft) => CityDraft) {
    setDrafts((prev) => prev.map((d) => (d.cityId === cityId ? fn(d) : d)));
  }

  /**
   * Mirror a real user: their preferences become the drafts and the profile
   * re-seeds mechanically. The fanout view carries location centroids, so
   * their pinned places land on the map too.
   */
  function applyRealUser(user: RealUser) {
    setSelectedRealUserId(user.userId);
    setName(user.name ?? "Δημότης");
    setProfileDirty(false);
    const newDrafts: CityDraft[] = user.cities.map((pref) => ({
      cityId: pref.cityId,
      cityName: pref.cityName,
      topics: pref.topics,
      locations: pref.locations.map((l) => ({
        text: l.text,
        ...(l.lng != null && l.lat != null ? { lng: l.lng, lat: l.lat } : {}),
      })),
      center: null,
      logo: cities.find((c) => c.id === pref.cityId)?.logoImage ?? null,
    }));
    setDrafts(newDrafts);
    // locationPoints strips coordless and (0,0)-sentinel places.
    const firstPoint = newDrafts.flatMap((d) => locationPoints(d.locations))[0];
    if (firstPoint) setFocus({ lng: firstPoint.lng, lat: firstPoint.lat, zoom: 12.5 });
    for (const draft of newDrafts) {
      void geocode(draft.cityName, mapboxToken, undefined, "place,locality").then((hits) => {
        const center = hits[0] ? { lng: hits[0].lng, lat: hits[0].lat, zoom: 11.5 } : null;
        if (!center) return;
        setDrafts((prev) => prev.map((d) => (d.cityId === draft.cityId ? { ...d, center } : d)));
        if (!firstPoint && draft.cityId === newDrafts[0]?.cityId) setFocus(center);
      });
    }
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const meetings: MeetingSummary[] = (
        await Promise.all(drafts.map((d) => fetchMeetings(d.cityId, from)))
      ).flat();
      const queue = deriveQueue(meetings, from);
      if (queue.length === 0)
        throw new Error("Καμία δημοσιευμένη συνεδρίαση μετά από αυτή την ημερομηνία.");
      // The intro template opens the conversation, so the agent knows the
      // reader already got it — same as production, where the intro's
      // message row lands in the conversation once sent.
      const startAt = new Date(from).toISOString();
      const introTemplate = introTemplateFor(origin);
      const rendered = renderTemplate(introTemplate);
      const state: WakeState = {
        user: { name, cities: drafts.map(({ center: _c, logo: _l, ...pref }) => pref) },
        profile,
        conversation: [{ at: startAt, from: "notis", text: rendered.body }],
        decisions: [],
      };
      onComplete(
        {
          state,
          clock: startAt,
          queue,
          settings: {},
          locationPoints: Object.fromEntries(drafts.map((d) => [d.cityId, locationPoints(d.locations)])),
          origin,
          cityMeta: Object.fromEntries(
            drafts.map((d) => [d.cityId, { name: d.cityName, logo: d.logo }]),
          ),
        },
        from,
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  // The casting-sheet portrait: a real user keeps their stable face (same
  // seed as the admin lists); a fictional one grows a face from the name as
  // it is typed.
  const avatarSeed = realMode && selectedRealUserId ? selectedRealUserId : name.trim() || "?";

  return (
    <div className="grid h-full lg:grid-cols-[minmax(480px,620px)_1fr]">
      {/* ——— the casting sheet ——— */}
      <div className="flex min-h-0 flex-col overflow-y-auto">
        <div className="flex-1 space-y-12 px-10 py-10 lg:px-14">
          <header className="wizard-reveal space-y-1" style={{ animationDelay: "0ms" }}>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-orange">
              Playground
            </p>
            <h1 className="font-relative text-3xl leading-tight">
              Φτιάξε έναν δημότη<span className="text-orange">.</span>
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
              Ο Νότης θα τον γνωρίσει όπως κάθε πραγματικό χρήστη: από τις προτιμήσεις του και
              όσα του γράφει.
            </p>
          </header>

          {error && (
            <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* 01 — who */}
          <section className="wizard-reveal space-y-5" style={{ animationDelay: "80ms" }}>
            <SectionHeader n="01" title="Ποιος είναι" />

            {(
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      [false, "Φανταστικός δημότης", "Φτιάξ' τον από το μηδέν"],
                      [true, "Πραγματικός χρήστης", "Από τις προτιμήσεις ειδοποιήσεων"],
                    ] as const
                  ).map(([mode, label, hint]) => (
                    <button
                      key={label}
                      onClick={() => setRealMode(mode)}
                      className={`border px-4 py-2.5 text-left transition-colors ${
                        realMode === mode
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="block text-sm font-medium">{label}</span>
                      <span
                        className={`block text-xs ${
                          realMode === mode ? "text-background/70" : "text-muted-foreground/70"
                        }`}
                      >
                        {hint}
                      </span>
                    </button>
                  ))}
                </div>

                {realMode && realUsers && !realUsers.available && (
                  <p className="text-sm text-muted-foreground">
                    Μη διαθέσιμο — αυτό το περιβάλλον δεν έχει MAIN_DATABASE_URL.
                  </p>
                )}
                {realMode && (realUsers?.available ?? true) && (
                  <div className="space-y-2">
                    <input
                      value={realSearch}
                      onChange={(e) => setRealSearch(e.target.value)}
                      placeholder="Αναζήτηση ονόματος ή τηλεφώνου"
                      className="h-9 w-full border-b border-border bg-transparent text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground"
                    />
                    <ul className="max-h-64 divide-y overflow-y-auto border">
                      {(realUsers?.users ?? []).map((u) => {
                        const topicCount = u.cities.reduce((n, c) => n + c.topics.length, 0);
                        const locationCount = u.cities.reduce((n, c) => n + c.locations.length, 0);
                        return (
                          <li key={u.userId}>
                            <button
                              onClick={() => applyRealUser(u)}
                              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary ${
                                selectedRealUserId === u.userId ? "bg-secondary" : ""
                              }`}
                            >
                              <UserAvatar seed={u.userId} size={28} />
                              <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2">
                                <span className="text-sm font-medium">{u.name ?? "—"}</span>
                                {u.phone && (
                                  <span className="text-xs text-muted-foreground">{u.phone}</span>
                                )}
                                {u.notisEnabledAt && (
                                  <span className="text-[10px] font-medium uppercase tracking-wider text-orange">
                                    notis
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {u.cities.map((c) => c.cityName).join(", ")}
                                {" · "}
                                {topicCount} θέματα · {locationCount} περιοχές
                              </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                      {(realUsers?.users ?? []).length === 0 && (
                        <li className="px-3 py-2 text-sm text-muted-foreground">
                          {realLoading ? "Φόρτωση..." : "Κανένα αποτέλεσμα."}
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-start gap-5">
              <UserAvatar seed={avatarSeed} size={56} />
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Όνομα"
                  className="w-full border-b border-transparent bg-transparent font-relative text-2xl outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground"
                />
                <textarea
                  value={profile}
                  onChange={(e) => {
                    setProfileDirty(true);
                    setProfile(e.target.value);
                  }}
                  rows={2}
                  placeholder="Δυο λόγια — πού μένει, τι τον νοιάζει..."
                  className="w-full resize-none border-b border-transparent bg-transparent text-sm leading-relaxed text-muted-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground focus:text-foreground"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pl-[76px]">
              {(
                [
                  [
                    "transition",
                    "Μετάβαση από τις ειδοποιήσεις",
                    "Λάμβανε ήδη WhatsApp/SMS — ξεκινά με το demos_transition",
                  ],
                  ["signup", "Νέα εγγραφή", "Μόλις γράφτηκε στο site — ξεκινά με το demos_intro"],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  onClick={() => setOrigin(value)}
                  title={hint}
                  className={`border px-3 py-1.5 text-xs transition-colors ${
                    origin === value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

          </section>

          {/* 02 — where & what */}
          <section className="wizard-reveal space-y-6" style={{ animationDelay: "160ms" }}>
            <SectionHeader n="02" title="Πού μένει, τι τον αφορά" />

            <div className="relative">
              <input
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                placeholder={drafts.length === 0 ? "Σε ποιον δήμο μένει;" : "Πρόσθεσε κι άλλον δήμο"}
                className="h-10 w-full border-b border-border bg-transparent text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground"
              />
              {citySearch && availableCities.length > 0 && (
                <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto border bg-popover shadow-lg">
                  {availableCities.slice(0, 8).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          void addCity(c);
                        }}
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {drafts.length === 0 && !citySearch && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  {cities.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => void addCity(c)}
                      className="text-sm text-muted-foreground underline-offset-4 hover:text-orange hover:underline"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-8">
              {drafts.map((draft) => (
                <article key={draft.cityId} className="wizard-reveal group/city space-y-4">
                  <header className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 bg-orange" />
                    <h3
                      className="cursor-pointer font-relative text-xl leading-none"
                      onClick={() => draft.center && setFocus(draft.center)}
                      title="Δες τον στον χάρτη"
                    >
                      {draft.cityName}
                    </h3>
                    <button
                      onClick={() => setDrafts((prev) => prev.filter((d) => d.cityId !== draft.cityId))}
                      className="ml-auto text-muted-foreground/0 transition-colors hover:!text-destructive group-hover/city:text-muted-foreground"
                      aria-label={`Αφαίρεση ${draft.cityName}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </header>

                  <div className="space-y-4 border-l border-border pl-[calc(0.3125rem+0.625rem)]">
                    <div className="flex flex-wrap gap-1.5">
                      {topics.map((t) => {
                        const on = draft.topics.includes(t.name);
                        return (
                          <button
                            key={t.id}
                            onClick={() =>
                              updateDraft(draft.cityId, (d) => ({
                                ...d,
                                topics: on
                                  ? d.topics.filter((x) => x !== t.name)
                                  : [...d.topics, t.name],
                              }))
                            }
                            className={`border px-2.5 py-1 text-xs transition-colors ${
                              on
                                ? "border-foreground bg-foreground text-background"
                                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                            }`}
                          >
                            {t.name}
                          </button>
                        );
                      })}
                    </div>

                    <div className="max-w-md space-y-1">
                      {draft.locations.map((l, i) => (
                        <div
                          key={`${locationText(l)}${i}`}
                          className="group/loc flex items-center gap-2 py-0.5 text-sm"
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-orange" />
                          <span className="truncate">{locationText(l)}</span>
                          <button
                            onClick={() =>
                              updateDraft(draft.cityId, (d) => ({
                                ...d,
                                locations: d.locations.filter((_, j) => j !== i),
                              }))
                            }
                            className="ml-auto text-muted-foreground/0 transition-colors hover:!text-destructive group-hover/loc:text-muted-foreground"
                            aria-label={`Αφαίρεση ${locationText(l)}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <AddressSearch
                        token={mapboxToken}
                        proximity={draft.center}
                        onPick={(hit) =>
                          updateDraft(draft.cityId, (d) => ({
                            ...d,
                            // Object form with coordinates: wake assembly
                            // computes subject distances and the map derives
                            // its pins from these.
                            locations: [...d.locations, { text: hit.text, lng: hit.lng, lat: hit.lat }],
                          }))
                        }
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* 03 — when */}
          <section className="wizard-reveal space-y-5 pb-4" style={{ animationDelay: "240ms" }}>
            <SectionHeader n="03" title="Η ιστορία ξεκινά" />
            <div className="flex items-baseline gap-3">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border-b border-border bg-transparent pb-1 font-relative text-xl outline-none transition-colors focus:border-foreground"
              />
              <p className="text-sm text-muted-foreground">
                κι από εκεί ζει ό,τι έχει δημοσιευτεί, συνεδρίαση-συνεδρίαση.
              </p>
            </div>
          </section>
        </div>

        {/* CTA */}
        <div className="wizard-reveal sticky bottom-0 border-t bg-background/95 px-10 py-4 backdrop-blur lg:px-14" style={{ animationDelay: "320ms" }}>
          <button
            onClick={start}
            disabled={busy || drafts.length === 0}
            className="flex h-12 w-full items-center justify-center gap-2 bg-orange font-medium text-white transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Φορτώνω τις συνεδριάσεις...
              </>
            ) : (
              "Ξεκίνα την προσομοίωση"
            )}
          </button>
        </div>
      </div>

      {/* ——— the map canvas ——— */}
      <LocationsMap
        token={mapboxToken}
        points={allPoints}
        focus={focus}
        className="hidden min-h-0 lg:block"
      />

      <style>{`
        .wizard-reveal {
          animation: wizard-rise .6s cubic-bezier(.16,1,.3,1) both;
        }
        @keyframes wizard-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .wizard-reveal { animation: none; }
        }
      `}</style>
    </div>
  );
}
