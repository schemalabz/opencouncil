"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { renderTemplate } from "@/agent/templates";
import { CityPreference, WakeState } from "@/agent/types";
import { CityOption, TopicOption, fetchCities, fetchMeetings, fetchTopics, geocode } from "../api";
import { MeetingSummary, deriveQueue } from "../deriveQueue";
import { LocationPoint, Sim } from "../types";
import { AddressSearch } from "./AddressSearch";
import { LocationsMap, MapFocus } from "./LocationsMap";

interface Props {
  mapboxToken: string | undefined;
  onComplete(sim: Sim, from: string): void;
}

interface CityDraft extends CityPreference {
  points: LocationPoint[];
  center: MapFocus | null;
  logo?: string | null;
}

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
  const [profile, setProfile] = useState(
    "Μένει στην πόλη χρόνια. Ενδιαφέρεται για όσα αλλάζουν την καθημερινότητά της.",
  );
  const [origin, setOrigin] = useState<"transition" | "signup">("transition");
  const [from, setFrom] = useState("2026-05-01");

  useEffect(() => {
    fetchCities().then(setCities).catch((e) => setError(String(e)));
    fetchTopics().then(setTopics).catch((e) => setError(String(e)));
  }, []);

  const availableCities = useMemo(
    () =>
      cities
        .filter((c) => !drafts.some((d) => d.cityId === c.id))
        .filter((c) => c.name.toLowerCase().includes(citySearch.toLowerCase())),
    [cities, citySearch, drafts],
  );

  const allPoints = useMemo(() => drafts.flatMap((d) => d.points), [drafts]);

  async function addCity(c: CityOption) {
    setCitySearch("");
    const draft: CityDraft = {
      cityId: c.id,
      cityName: c.name,
      topics: [],
      locations: [],
      points: [],
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
      // Enrollment sends the origin-appropriate template before any wake; it
      // enters the journal so the agent knows the reader already got an intro.
      const startAt = new Date(from).toISOString();
      const introTemplate = origin === "transition" ? "demos_transition" : "demos_intro";
      const rendered = renderTemplate(introTemplate);
      const state: WakeState = {
        user: { name, cities: drafts.map(({ points: _p, center: _c, ...pref }) => pref) },
        profile,
        journal: [
          {
            at: startAt,
            event: "enrollment",
            decision: "send",
            rationale: `(σύστημα) Εγγραφή μέσω ${
              origin === "transition"
                ? "μετάβασης από τις παλιές ειδοποιήσεις"
                : "νέας εγγραφής στο site"
            } — στάλθηκε το εγκεκριμένο template ${introTemplate}.`,
            messages: [rendered.body],
          },
        ],
      };
      onComplete(
        {
          state,
          clock: startAt,
          queue,
          cursor: 0,
          settings: {},
          locationPoints: Object.fromEntries(drafts.map((d) => [d.cityId, d.points])),
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

  const initial = (name.trim()[0] ?? ";").toUpperCase();

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
            <div className="flex items-start gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-foreground font-relative text-2xl text-background">
                {initial}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Όνομα"
                  className="w-full border-b border-transparent bg-transparent font-relative text-2xl outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground"
                />
                <textarea
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
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
                          key={`${l}${i}`}
                          className="group/loc flex items-center gap-2 py-0.5 text-sm"
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-orange" />
                          <span className="truncate">{l}</span>
                          <button
                            onClick={() =>
                              updateDraft(draft.cityId, (d) => ({
                                ...d,
                                locations: d.locations.filter((_, j) => j !== i),
                                points: d.points.filter((_, j) => j !== i),
                              }))
                            }
                            className="ml-auto text-muted-foreground/0 transition-colors hover:!text-destructive group-hover/loc:text-muted-foreground"
                            aria-label={`Αφαίρεση ${l}`}
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
                            locations: [...d.locations, hit.text],
                            points: [...d.points, hit],
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
