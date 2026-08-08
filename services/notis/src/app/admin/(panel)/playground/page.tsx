"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Button } from "@opencouncil/ui/button";
import { isWindowOpen, templateForEvent } from "@/agent/templates";
import { WakeEvent, WakeOutcome } from "@/agent/types";
import { env } from "@/env.mjs";
import { ConversationView } from "../_components/ConversationView";
import { PageHeader } from "../_components/PageHeader";
import { dryRun, fetchBrief, fetchShippedPrompt } from "./api";
import { PromptEditor } from "./components/PromptEditor";
import { SetupWizard } from "./components/SetupWizard";
import { emptyStore, loadStore, reducer, saveStore } from "./store";
import { QueueItem, hasPendingBrief } from "./types";

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
  const busy = busyItemId !== undefined;

  useEffect(() => {
    const loaded = loadStore();
    if (loaded.setup.done) {
      dispatch({ type: "hydrate", store: loaded });
    }
    fetchShippedPrompt().then(setShippedPrompt).catch(() => undefined);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) saveStore(store);
  }, [store, mounted]);

  const totalCost = useMemo(
    () => Object.values(store.traces).reduce((sum, t) => sum + t.costUsd, 0),
    [store.traces],
  );

  const runItem = useCallback(async (item: QueueItem): Promise<WakeOutcome | undefined> => {
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
      setBusyItemId(undefined);
    }
  }, []);

  const step = useCallback(() => {
    const next = storeRef.current.sim.queue.find((q) => q.status === "pending");
    if (next) void runItem(next);
  }, [runItem]);

  // Fast-forward: keep running wakes until ο Νότης actually writes (or the
  // queue runs dry / an error stops us / the user hits stop).
  const runUntilSend = useCallback(async () => {
    setAutoRun(true);
    stopRef.current = false;
    try {
      for (;;) {
        if (stopRef.current) break;
        const next = storeRef.current.sim.queue.find((q) => q.status === "pending");
        if (!next) break;
        const outcome = await runItem(next);
        if (!outcome || outcome.messages.length > 0) break;
      }
    } finally {
      setAutoRun(false);
    }
  }, [runItem]);

  const stopAutoRun = useCallback(() => {
    stopRef.current = true;
  }, []);

  const skip = useCallback(() => {
    const next = storeRef.current.sim.queue.find((q) => q.status === "pending");
    if (next) dispatch({ type: "skip", itemId: next.id });
  }, []);

  const userMessage = useCallback(
    (text: string) => {
      const clock = storeRef.current.sim.clock;
      const item: QueueItem = {
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
    () => store.snapshots.find((sn) => sn.label.startsWith(`${selectedId} · `))?.id,
    [store.snapshots, selectedId],
  );

  const rewind = useCallback(() => {
    if (!selectedSnapshotId) return;
    if (window.confirm("Να γυρίσει η προσομοίωση στη στιγμή πριν από αυτό το βήμα;")) {
      dispatch({ type: "restoreSnapshot", id: selectedSnapshotId });
      setSelectedId(undefined);
    }
  }, [selectedSnapshotId]);

  const exportScenario = useCallback(() => {
    const s = storeRef.current;
    const item = s.sim.queue.find((q) => q.id === selectedId);
    const trace = selectedId ? s.traces[selectedId] : undefined;
    const snapshot = s.snapshots.find((sn) => sn.label.startsWith(`${selectedId} · `));
    if (!item?.outcome || !trace) return;
    const fixture = {
      name: `scenario-${item.id.replace(/[^a-z0-9]+/gi, "-")}`,
      state: snapshot?.sim.state ?? null,
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
        {store.sim.unsubscribedAt && (
          <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
            ΣΤΟΠ · {store.sim.unsubscribedAt.slice(0, 10)}
          </span>
        )}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          σύνολο ${totalCost.toFixed(2)}
        </span>
        <PromptEditor
          promptOverride={store.sim.promptOverride}
          shippedPrompt={shippedPrompt}
          onPromptOverride={(value) => dispatch({ type: "setPromptOverride", value })}
        />
        <Button
          size="sm"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            if (window.confirm("Να διαγραφεί όλη η προσομοίωση;")) {
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
          canRewind: Boolean(selectedSnapshotId),
          onRewind: rewind,
          onExport: exportScenario,
        }}
      />
    </div>
  );
}
