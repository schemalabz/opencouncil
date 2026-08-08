"use client";

import { WakeTrace } from "@/agent/types";
import { CityMeta, WakeRecord } from "../_lib/records";
import { InspectorPane, InspectorSimActions } from "./InspectorPane";
import { Timeline } from "./Timeline";
import { SimControls, WhatsAppChat } from "./WhatsAppChat";

/**
 * The full inspection surface — timeline over chat + inspector — shared by
 * the playground (with sim controls) and the read-only viewer for real
 * conversations (omit `chatSim`/`inspectorSim`).
 */
interface Props {
  records: WakeRecord[];
  cityMeta?: CityMeta;
  clock: string;
  origin: "transition" | "signup";
  startAt: string;
  profile: string;
  selectedId?: string;
  busyItemId?: string;
  onSelect(id: string | undefined): void;
  traceFor(id: string): WakeTrace | undefined;
  chatSim?: SimControls;
  inspectorSim?: InspectorSimActions;
}

export function ConversationView({
  records,
  cityMeta,
  clock,
  origin,
  startAt,
  profile,
  selectedId,
  busyItemId,
  onSelect,
  traceFor,
  chatSim,
  inspectorSim,
}: Props) {
  const selectedItem = records.find((q) => q.id === selectedId);

  return (
    <>
      <Timeline
        records={records}
        cityMeta={cityMeta}
        selectedId={selectedId}
        busyItemId={busyItemId}
        onSelect={onSelect}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_400px]">
        <div className="min-h-0 bg-muted/20 md:py-3">
          <WhatsAppChat
            records={records}
            clock={clock}
            busyItemId={busyItemId}
            origin={origin}
            startAt={startAt}
            selectedId={selectedId}
            onSelect={onSelect}
            sim={chatSim}
          />
        </div>
        <div className="min-h-0 overflow-hidden border-l">
          <InspectorPane
            item={selectedItem}
            trace={selectedId ? traceFor(selectedId) : undefined}
            profile={profile}
            sim={inspectorSim}
          />
        </div>
      </div>
    </>
  );
}
