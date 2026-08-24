"use client";

import { WakeTrace } from "@/agent/types";
import { CityMeta, Origin, WakeRecord } from "../_lib/records";
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
  origin: Origin;
  startAt: string;
  profile: string;
  memory?: string;
  selectedId?: string;
  busyItemId?: string;
  onSelect(id: string | undefined): void;
  traceFor(id: string): WakeTrace | undefined;
  chatSim?: SimControls;
  inspectorSim?: InspectorSimActions;
  upcoming?: import("../_lib/conversations").UpcomingWake[];
  commitments?: import("../_lib/conversations").CommitmentNote[];
}

export function ConversationView({
  records,
  cityMeta,
  clock,
  origin,
  startAt,
  profile,
  memory,
  selectedId,
  busyItemId,
  onSelect,
  traceFor,
  chatSim,
  inspectorSim,
  upcoming,
  commitments,
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
            upcoming={upcoming}
            commitments={commitments}
          />
        </div>
        <div className="min-h-0 overflow-hidden border-l">
          <InspectorPane
            item={selectedItem}
            trace={selectedId ? traceFor(selectedId) : undefined}
            profile={profile}
            memory={memory}
            sim={inspectorSim}
          />
        </div>
      </div>
    </>
  );
}
