"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Button } from "@opencouncil/ui/button";
import { isWindowOpen, templateForEvent } from "@/agent/templates";
import { WakeEvent, WakeOutcome } from "@/agent/types";
import { env } from "@/env.mjs";
import { ConversationView } from "../_components/ConversationView";
import { PageHeader } from "../_components/PageHeader";
import { StopBadge } from "../_components/StopBadge";
import { dryRun, fetchBrief, fetchShippedPrompt } from "./api";
import { PromptEditor } from "./components/PromptEditor";
import { SetupWizard } from "./components/SetupWizard";
import { emptyStore, loadStore, reducer, saveStore } from "./store";
import { WakeRecord, hasPendingBrief } from "./types";

const MAPBOX_TOKEN = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export default function PlaygroundPage() {
  const [store, dispatch] = useReducer(reducer, undefined, emptyStore);
  const [mounted, setMounted] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | undefined>();
  const [autoRun, setAutoRun] = useState(false);
  const stopRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [shippedPrompt, setShippedPrompt] = useState<string | undefined>();
  const storeRef = useRef(store);
  storeRef.current = store;
  // Synchronous mirror of the busy flag: React state is stale within a tick,
  // so two quick clicks (or a message during a step) could both pass a
  // state-based guard and clobber each other's stepDone.
  const busyRef = useRef(false);
  // Bumped on rewind/reset: a wake still in flight from before the bump must
  // not land its stepDone on the rewound store (timeline shows the past,
  // state holds the future, and the auto-save persists the corruption).
  const runEpochRef = useRef(0);
  const mountedRef = useRef(false);
  mountedRef.current = mounted;
  const busy = busyItemId !== undefined;

  useEffect(() => {
    const loaded = loadStore();
    if (loaded.setup.done) {
      dispatch({ type: "hydrate", store: loaded });
    }
    fetchShippedPrompt().then(setShippedPrompt).catch(() => undefined);
    setMounted(true);
  }, []);

  // Debounced: during run-until-send every step dispatches several actions,
  // and serializing the whole store (traces included) on each would jank the
  // main thread. A 500ms trailing save loses at most half a second of state —
  // and the flush below closes even that window on unmount or tab close.
  useEffect(() => {
    if (!mounted) return;
    const t = setTimeout(() => saveStore(store), 500);
    return () => clearTimeout(t);
  }, [store, mounted]);

  useEffect(() => {
    const flush = () => {
      // Never flush before hydration: writing the initial empty store would
      // wipe whatever localStorage holds.
      if (mountedRef.current) saveStore(storeRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const totalCost = useMemo(
    () => Object.values(store.traces).reduce((sum, t) => sum + t.costUsd, 0),
    [store.traces],
  );

  const runItem = useCallback(async (item: WakeRecord): Promise<WakeOutcome | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    const epoch = runEpochRef.current;
    setBusyItemId(item.id);
    setError(null);
    try {
      const current = storeRef.current;
      let event: WakeEvent;
      if (hasPendingBrief(item.event)) {
        const brief = await fetchBrief(
          item.event.cityId,
          item.event.meetingId,
          item.event.type === "agenda_processed" ? "agenda" : "summary",
        );
        const full = { ...item.event, brief } as WakeEvent;
        dispatch({ type: "briefReady", itemId: item.id, event: full });
        event = full;
      } else {
        event = item.event as WakeEvent;
      }
      const { outcome, trace, appliedState } = await dryRun(current.sim.state, event, {
        promptOverride: current.sim.promptOverride,
        ...current.sim.settings,
      });
      if (epoch !== runEpochRef.current) return undefined; // rewound/reset mid-flight
      // WhatsApp rails: inside the 24h customer-service window (opened by the
      // user's last message) sends go free-form; outside it every message must
      // ride an approved template shell.
      const isUserMsg = event.type === "user_message";
      const windowOpen = isUserMsg || isWindowOpen(current.sim.lastUserMessageAt, new Date(event.at));
      const delivery =
        outcome.messages.length > 0
          ? windowOpen
            ? ({ mode: "freeform" } as const)
            : ({ mode: "template", template: templateForEvent(event.type) } as const)
          : undefined;
      dispatch({
        type: "stepDone",
        itemId: item.id,
        outcome,
        trace,
        nextState: appliedState,
        clock: event.at,
        snapshotLabel: `${item.id} · ${event.at.slice(0, 10)} ${event.type}`,
        delivery,
        userMessageAt: isUserMsg ? event.at : undefined,
      });
      setSelectedId(item.id);
      return outcome;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      busyRef.current = false;
      setBusyItemId(undefined);
    }
  }, []);

  // After a ΣΤΟΠ (unsubscribe) the production scheduler would never fire
  // another proactive wake, so the simulator stops advancing too. Injected
  // user messages still run — inbound survives an unsubscribe.
  const nextPending = useCallback(
    () =>
      storeRef.current.sim.unsubscribedAt
        ? undefined
        : storeRef.current.sim.queue.find((q) => q.status === "pending"),
    [],
  );

  const step = useCallback(() => {
    const next = nextPending();
    if (next) void runItem(next);
  }, [nextPending, runItem]);

  // Fast-forward: keep running wakes until ο Νότης actually writes (or the
  // queue runs dry / an error stops us / the user hits stop).
  const runUntilSend = useCallback(async () => {
    setAutoRun(true);
    stopRef.current = false;
    // storeRef only updates on render, and this loop's continuation runs
    // before the render commits — without the tick-yield it re-picks the wake
    // it just finished and pays for a second identical dryRun (reproduced).
    // The ledger and the cap are belt and braces: a re-pick breaks instead of
    // re-running, and a model that keeps scheduling follow-ups cannot run at
    // real cost forever.
    const ran = new Set<string>();
    const MAX_AUTO_STEPS = 50;
    try {
      for (let steps = 0; steps < MAX_AUTO_STEPS; steps++) {
        if (stopRef.current) break;
        const next = nextPending();
        if (!next || ran.has(next.id)) break;
        ran.add(next.id);
        const outcome = await runItem(next);
        if (!outcome || outcome.messages.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      setAutoRun(false);
    }
  }, [nextPending, runItem]);

  const stopAutoRun = useCallback(() => {
    stopRef.current = true;
  }, []);

  const skip = useCallback(() => {
    const next = nextPending();
    if (next) dispatch({ type: "skip", itemId: next.id });
  }, [nextPending]);

  const userMessage = useCallback(
    (text: string) => {
      // A wake is already in flight (step or run-until-send): running a second
      // one from the same base state would lose whichever update lands first.
      if (busyRef.current) return;
      const clock = storeRef.current.sim.clock;
      const item: WakeRecord = {
        id: `user:${Date.now()}`,
        event: { type: "user_message", at: clock, text },
        status: "pending",
      };
      dispatch({ type: "userMessage", item });
      void runItem(item);
    },
    [runItem],
  );

  const selectedSnapshotId = useMemo(
    () => store.snapshots.find((sn) => sn.itemId === selectedId)?.id,
    [store.snapshots, selectedId],
  );

  const rewind = useCallback(() => {
    if (!selectedSnapshotId || busyRef.current) return;
    if (window.confirm("Να γυρίσει η προσομοίωση στη στιγμή πριν από αυτό το βήμα;")) {
      runEpochRef.current += 1;
      dispatch({ type: "restoreSnapshot", id: selectedSnapshotId });
      setSelectedId(undefined);
    }
  }, [selectedSnapshotId]);

  const exportScenario = useCallback(() => {
    const s = storeRef.current;
    const item = s.sim.queue.find((q) => q.id === selectedId);
    const trace = selectedId ? s.traces[selectedId] : undefined;
    const snapshot = s.snapshots.find((sn) => sn.itemId === selectedId);
    if (!item?.outcome || !trace) return;
    const fixture = {
      name: `scenario-${item.id.replace(/[^a-z0-9]+/gi, "-")}`,
      state: snapshot?.state ?? null,
      event: item.event,
      recordedTurns: trace.turns,
      expected: {
        decision: item.outcome.decision,
        messageCount: item.outcome.messages.length,
        profileRewritten: item.outcome.profileRewrite !== undefined,
        scheduledWakes: item.outcome.scheduledWakes.length,
      },
    };
    const blob = new Blob([JSON.stringify(fixture, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fixture.name}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [selectedId]);

  if (!mounted) return null;

  if (!store.setup.done) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <PageHeader title="Playground">
          <span className="self-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            νέα προσομοίωση
          </span>
        </PageHeader>
        <div className="min-h-0 flex-1">
          <SetupWizard
            mapboxToken={MAPBOX_TOKEN}
            onComplete={(sim, from) => dispatch({ type: "setupComplete", sim, from })}
          />
        </div>
      </div>
    );
  }

  const user = store.sim.state.user;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader title="Playground">
        <span className="truncate text-xs text-muted-foreground">
          {user.name} · {user.cities.map((c) => c.cityName).join(", ")} · από {store.setup.from}
        </span>
        {store.sim.unsubscribedAt && <StopBadge at={store.sim.unsubscribedAt} />}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          σύνολο ${totalCost.toFixed(2)}
        </span>
        <PromptEditor
          promptOverride={store.sim.promptOverride}
          shippedPrompt={shippedPrompt}
          onPromptOverride={(value) => dispatch({ type: "setPromptOverride", value })}
          effort={store.sim.settings.effort as "low" | "medium" | "high" | undefined}
          onEffort={(value) => dispatch({ type: "setSettings", value: { effort: value } })}
        />
        <Button
          size="sm"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={busy || autoRun}
          onClick={() => {
            if (window.confirm("Να διαγραφεί όλη η προσομοίωση;")) {
              runEpochRef.current += 1;
              dispatch({ type: "reset" });
              setSelectedId(undefined);
            }
          }}
        >
          Reset
        </Button>
      </PageHeader>

      {error && (
        <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <ConversationView
        records={store.sim.queue}
        cityMeta={store.sim.cityMeta}
        clock={store.sim.clock}
        origin={store.sim.origin}
        startAt={store.setup.from}
        profile={store.sim.state.profile}
        selectedId={selectedId}
        busyItemId={busyItemId}
        onSelect={setSelectedId}
        traceFor={(id) => store.traces[id]}
        chatSim={{
          busy,
          autoRun,
          onStep: step,
          onSkip: skip,
          onRunUntilSend: () => void runUntilSend(),
          onStopAutoRun: stopAutoRun,
          onUserMessage: userMessage,
        }}
        inspectorSim={{
          canRewind: Boolean(selectedSnapshotId) && !busy && !autoRun,
          onRewind: rewind,
          onExport: exportScenario,
        }}
      />
    </div>
  );
}
