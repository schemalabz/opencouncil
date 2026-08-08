"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@opencouncil/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@opencouncil/ui/card";
import { Checkbox } from "@opencouncil/ui/checkbox";
import { Input } from "@opencouncil/ui/input";
import { Textarea } from "@opencouncil/ui/textarea";
import { Badge } from "@opencouncil/ui/badge";
import { CityPreference, WakeState } from "@/agent/types";
import { CityOption, TopicOption, fetchCities, fetchMeetings, fetchTopics } from "../api";
import { MeetingSummary, deriveQueue } from "../deriveQueue";
import { Sim } from "../types";

interface Props {
  onComplete(sim: Sim, from: string, to: string): void;
}

export function SetupWizard({ onComplete }: Props) {
  const [cities, setCities] = useState<CityOption[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [citySearch, setCitySearch] = useState("");
  const [selected, setSelected] = useState<Map<string, CityPreference>>(new Map());
  const [name, setName] = useState("Μαρία");
  const [profile, setProfile] = useState(
    "Μένει στην πόλη χρόνια. Ενδιαφέρεται για όσα αλλάζουν την καθημερινότητά της.",
  );
  const [from, setFrom] = useState("2026-05-01");
  const [to, setTo] = useState("2026-07-31");
  const [locationDraft, setLocationDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchCities().then(setCities).catch((e) => setError(String(e)));
    fetchTopics().then(setTopics).catch((e) => setError(String(e)));
  }, []);

  const filteredCities = useMemo(
    () =>
      cities.filter((c) => c.name.toLowerCase().includes(citySearch.toLowerCase())).slice(0, 8),
    [cities, citySearch],
  );

  function toggleCity(c: CityOption) {
    const next = new Map(selected);
    if (next.has(c.id)) next.delete(c.id);
    else next.set(c.id, { cityId: c.id, cityName: c.name, topics: [], locations: [] });
    setSelected(next);
  }

  function toggleTopic(cityId: string, topic: string) {
    const next = new Map(selected);
    const pref = next.get(cityId);
    if (!pref) return;
    pref.topics = pref.topics.includes(topic)
      ? pref.topics.filter((t) => t !== topic)
      : [...pref.topics, topic];
    setSelected(next);
  }

  function addLocation(cityId: string) {
    const draft = (locationDraft[cityId] ?? "").trim();
    if (!draft) return;
    const next = new Map(selected);
    const pref = next.get(cityId);
    if (!pref) return;
    pref.locations = [...pref.locations, draft];
    setSelected(next);
    setLocationDraft({ ...locationDraft, [cityId]: "" });
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const prefs = [...selected.values()];
      const meetings: MeetingSummary[] = (
        await Promise.all(prefs.map((p) => fetchMeetings(p.cityId, from, to)))
      ).flat();
      const queue = deriveQueue(meetings, from, to);
      if (queue.length === 0) {
        throw new Error("Καμία δημοσιευμένη συνεδρίαση στο διάστημα αυτό.");
      }
      const state: WakeState = { user: { name, cities: prefs }, profile, journal: [] };
      onComplete(
        { state, clock: new Date(from).toISOString(), queue, cursor: 0, settings: {} },
        from,
        to,
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <h1 className="font-relative text-2xl">Playground · νέος προσομοιωμένος χρήστης</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Δήμοι</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Αναζήτηση δήμου..."
            value={citySearch}
            onChange={(e) => setCitySearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {filteredCities.map((c) => (
              <Badge
                key={c.id}
                variant={selected.has(c.id) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleCity(c)}
              >
                {c.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {[...selected.values()].map((pref) => (
        <Card key={pref.cityId}>
          <CardHeader>
            <CardTitle className="text-base">{pref.cityName} · θέματα & τοποθεσίες</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {topics.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={pref.topics.includes(t.name)}
                    onCheckedChange={() => toggleTopic(pref.cityId, t.name)}
                  />
                  {t.name}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Γειτονιά ή δρόμος (π.χ. Κυψέλη)"
                value={locationDraft[pref.cityId] ?? ""}
                onChange={(e) =>
                  setLocationDraft({ ...locationDraft, [pref.cityId]: e.target.value })
                }
                onKeyDown={(e) => e.key === "Enter" && addLocation(pref.cityId)}
              />
              <Button variant="outline" onClick={() => addLocation(pref.cityId)}>
                +
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {pref.locations.map((l) => (
                <Badge key={l} variant="secondary">
                  {l}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · Ποιος είναι;</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Όνομα" />
          <Textarea
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            rows={3}
            placeholder="Αρχικό προφίλ (τι τον/την ενδιαφέρει)"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3 · Διάστημα ιστορίας</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-muted-foreground">έως</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </CardContent>
      </Card>

      <Button onClick={start} disabled={busy || selected.size === 0} className="w-full">
        {busy ? "Φόρτωση συνεδριάσεων..." : "Ξεκίνα την προσομοίωση"}
      </Button>
    </main>
  );
}
