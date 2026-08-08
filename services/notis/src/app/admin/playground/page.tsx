"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { WakeEvent } from "@/agent/types";
import { dryRun, fetchBrief, fetchShippedPrompt } from "./api";
import { ChatPane } from "./components/ChatPane";
import { InspectorPane } from "./components/InspectorPane";
import { QueuePane } from "./components/QueuePane";
import { SetupWizard } from "./components/SetupWizard";
import { emptyStore, loadStore, reducer, saveStore } from "./store";
import { QueueItem, hasPendingBrief } from "./types";

export default function PlaygroundPage() {
  const [store, dispatch] = useReducer(reducer, undefined, emptyStore);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [shippedPrompt, setShippedPrompt] = useState<string | undefined>();
  const storeRef = useRef(store);
  storeRef.current = store;

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

  const runItem = useCallback(
    async (item: QueueItem) => {
      setBusy(true);
      setError(null);
      try {
        const current = storeRef.current;
        let event: WakeEvent;
        if (hasPendingBrief(item.event)) {
          const brief = await fetchBrief(item.event.cityId, item.event.meetingId);
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
        dispatch({
          type: "stepDone",
          itemId: item.id,
          outcome,
          trace,
          nextState: appliedState,
          clock: event.at,
          snapshotLabel: `${item.id} · ${event.at.slice(0, 10)} ${event.type}`,
        });
        setSelectedId(item.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [dispatch],
  );

  const step = useCallback(() => {
    const next = storeRef.current.sim.queue.find((q) => q.status === "pending");
    if (next) void runItem(next);
  }, [runItem]);

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
      <SetupWizard
        onComplete={(sim, from, to) => dispatch({ type: "setupComplete", sim, from, to })}
      />
    );
  }

  const selectedItem = store.sim.queue.find((q) => q.id === selectedId);

  return (
    <div className="grid h-[calc(100vh-49px)] grid-cols-[280px_1fr_380px]">
      <div className="border-r">
        <QueuePane
          queue={store.sim.queue}
          snapshots={store.snapshots}
          promptOverride={store.sim.promptOverride}
          shippedPrompt={shippedPrompt}
          onRestore={(id) => dispatch({ type: "restoreSnapshot", id })}
          onPromptOverride={(value) => dispatch({ type: "setPromptOverride", value })}
          onReset={() => {
            if (window.confirm("Να διαγραφεί όλη η προσομοίωση;")) dispatch({ type: "reset" });
          }}
        />
      </div>
      <div className="flex flex-col">
        {error && (
          <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
        )}
        <ChatPane
          queue={store.sim.queue}
          clock={store.sim.clock}
          busy={busy}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onStep={step}
          onSkip={skip}
          onUserMessage={userMessage}
        />
      </div>
      <div className="border-l">
        <InspectorPane
          item={selectedItem}
          trace={selectedId ? store.traces[selectedId] : undefined}
          profile={store.sim.state.profile}
          onExport={exportScenario}
        />
      </div>
    </div>
  );
}
