import { WakeOutcome, WakeState, WakeTrace } from "@/agent/types";
import {
  PlaygroundStore,
  SimSettings,
  WakeRecord,
  SNAPSHOT_CAP,
  Sim,
  Snapshot,
  STORAGE_KEY,
  TRACE_CAP,
} from "./types";
import { insertChronological } from "./deriveQueue";

export function emptyStore(): PlaygroundStore {
  return {
    version: 3,
    setup: { done: false, from: "" },
    sim: {
      state: { user: { name: "", cities: [] }, profile: "", conversation: [], decisions: [] },
      clock: "",
      queue: [],
      settings: {},
      origin: "transition",
    },
    traces: {},
    traceOrder: [],
    snapshots: [],
  };
}

export function loadStore(): PlaygroundStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    window.localStorage.removeItem("notis:playground:v1");
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as PlaygroundStore;
    if (parsed.version !== 3) {
      // Never destroy a store this build cannot read (a newer deploy's data,
      // or corruption): stash it aside so the session's saves cannot clobber it.
      window.localStorage.setItem(`${STORAGE_KEY}:incompatible`, raw);
      return emptyStore();
    }
    return parsed;
  } catch {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) window.localStorage.setItem(`${STORAGE_KEY}:incompatible`, raw);
    return emptyStore();
  }
}

export function saveStore(store: PlaygroundStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded: drop traces AND snapshots (the two unbounded-ish terms)
    // and retry once; if even that fails, the session just lives in memory.
    console.warn("[notis:playground] localStorage quota hit — dropping traces and snapshots to fit");
    try {
      const slim: PlaygroundStore = { ...store, traces: {}, traceOrder: [], snapshots: [] };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {
      // storage unavailable — nothing sensible left to do
    }
  }
}

export type Action =
  | { type: "reset" }
  | { type: "hydrate"; store: PlaygroundStore }
  | { type: "setupComplete"; sim: Sim; from: string }
  | { type: "briefReady"; itemId: string; event: WakeRecord["event"] }
  | {
      type: "stepDone";
      itemId: string;
      outcome: WakeOutcome;
      trace: WakeTrace;
      nextState: WakeState;
      clock: string;
      snapshotLabel: string;
      delivery?: WakeRecord["delivery"];
      /** Set when the item was a user message — reopens the 24h window. */
      userMessageAt?: string;
    }
  | { type: "skip"; itemId: string }
  | { type: "userMessage"; item: WakeRecord }
  | { type: "setPromptOverride"; value?: string }
  | { type: "setSettings"; value: SimSettings }
  | { type: "restoreSnapshot"; id: string };

function pushTrace(store: PlaygroundStore, id: string, trace: WakeTrace): PlaygroundStore {
  const traces = { ...store.traces, [id]: trace };
  const traceOrder = [...store.traceOrder.filter((t) => t !== id), id];
  while (traceOrder.length > TRACE_CAP) {
    const evicted = traceOrder.shift();
    if (evicted) delete traces[evicted];
  }
  return { ...store, traces, traceOrder };
}

/**
 * Record the pre-step essentials. No deep copy: the reducer never mutates, so
 * holding references is safe — and the queue collapses to an id→status list,
 * which keeps 30 snapshots from serializing 30 copies of every brief.
 */
function pushSnapshot(store: PlaygroundStore, itemId: string, label: string): PlaygroundStore {
  const { sim } = store;
  const snapshot: Snapshot = {
    id: `snap-${Date.now()}-${store.snapshots.length}`,
    itemId,
    label,
    takenAt: sim.clock,
    state: sim.state,
    clock: sim.clock,
    queue: sim.queue.map((q) => ({ id: q.id, status: q.status })),
    lastUserMessageAt: sim.lastUserMessageAt,
    unsubscribedAt: sim.unsubscribedAt,
  };
  const snapshots = [...store.snapshots, snapshot];
  while (snapshots.length > SNAPSHOT_CAP) snapshots.shift();
  return { ...store, snapshots };
}

export function reducer(store: PlaygroundStore, action: Action): PlaygroundStore {
  switch (action.type) {
    case "reset":
      return emptyStore();

    case "hydrate":
      return action.store;

    case "setupComplete":
      return {
        ...emptyStore(),
        setup: { done: true, from: action.from },
        sim: action.sim,
      };

    case "briefReady":
      return {
        ...store,
        sim: {
          ...store.sim,
          queue: store.sim.queue.map((q) =>
            q.id === action.itemId ? { ...q, event: action.event } : q,
          ),
        },
      };

    case "stepDone": {
      const withSnapshot = pushSnapshot(store, action.itemId, action.snapshotLabel);
      const withTrace = pushTrace(withSnapshot, action.itemId, action.trace);
      let queue = withTrace.sim.queue.map((q) =>
        q.id === action.itemId
          ? {
              ...q,
              status: "done" as const,
              outcome: action.outcome,
              traceRef: action.itemId,
              ...(action.delivery ? { delivery: action.delivery } : {}),
            }
          : q,
      );
      for (const [i, wake] of action.outcome.scheduledWakes.entries()) {
        queue = insertChronological(queue, {
          id: `${action.itemId}:sched:${i}`,
          event: { type: "scheduled", at: wake.at, reason: wake.reason },
          status: "pending",
        });
      }
      return {
        ...withTrace,
        sim: {
          ...withTrace.sim,
          state: action.nextState,
          clock: action.clock,
          queue,
          ...(action.userMessageAt ? { lastUserMessageAt: action.userMessageAt } : {}),
          ...(action.outcome.unsubscribe ? { unsubscribedAt: action.clock } : {}),
        },
      };
    }

    case "skip": {
      const queue = store.sim.queue.map((q) =>
        q.id === action.itemId ? { ...q, status: "skipped" as const } : q,
      );
      return { ...store, sim: { ...store.sim, queue } };
    }

    case "userMessage": {
      const queue = insertChronological(store.sim.queue, action.item);
      return { ...store, sim: { ...store.sim, queue } };
    }

    case "setPromptOverride":
      return { ...store, sim: { ...store.sim, promptOverride: action.value } };

    case "setSettings":
      return { ...store, sim: { ...store.sim, settings: { ...store.sim.settings, ...action.value } } };

    case "restoreSnapshot": {
      const snapIndex = store.snapshots.findIndex((s) => s.id === action.id);
      if (snapIndex === -1) return store;
      const snap = store.snapshots[snapIndex];
      const statusById = new Map(snap.queue.map((q) => [q.id, q.status]));
      // Items born after the snapshot (scheduled wakes, injected user
      // messages) vanish; items whose status rewinds to pending shed their
      // outcome. Briefs and the prompt override deliberately survive — a
      // rewind exists to re-run the same wake, often with an edited prompt.
      const queue = store.sim.queue.flatMap((q) => {
        const status = statusById.get(q.id);
        if (status === undefined) return [];
        if (status === q.status) return [q];
        const { outcome: _o, traceRef: _t, delivery: _d, ...rest } = q;
        return [{ ...rest, status }];
      });
      return {
        ...store,
        // Snapshots at or after the restore point belong to the abandoned
        // timeline: keeping them leaves two snapshots per item id and a later
        // rewind silently restores the stale one.
        snapshots: store.snapshots.slice(0, snapIndex),
        sim: {
          ...store.sim,
          state: snap.state,
          clock: snap.clock,
          queue,
          lastUserMessageAt: snap.lastUserMessageAt,
          unsubscribedAt: snap.unsubscribedAt,
        },
      };
    }
  }
}
