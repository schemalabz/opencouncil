import { LANE_LABEL, TIMELINE_MOMENTS, type Lane } from "@/lib/explain/aiLiteracy";

const LANES: readonly Lane[] = ["municipality", "opencouncil", "citizens"];

/**
 * The six phases of a meeting as a list: the phase on the left, and on the
 * right what the δήμος does, what OpenCouncil does and what citizens see
 * during it. Same grid as MeetingStagesFlow below it, so the two read as one.
 */
export function MeetingPhases() {
    return (
        <ol className="not-prose m-0 mt-5 list-none divide-y divide-border p-0">
            {TIMELINE_MOMENTS.map((moment) => (
                <li key={moment.id} className="grid grid-cols-1 gap-x-5 gap-y-2 py-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
                    <p className="m-0 text-sm font-semibold leading-5 text-foreground">{moment.label}</p>
                    <dl className="m-0 space-y-2">
                        {LANES.map((lane) => {
                            const text = moment.lanes[lane];
                            if (!text) return null;
                            return (
                                <div key={lane} className="flex gap-3 text-sm leading-5">
                                    <dt className="w-24 shrink-0 font-medium text-foreground/80">{LANE_LABEL[lane]}</dt>
                                    <dd className="m-0 min-w-0 text-muted-foreground">{text}</dd>
                                </div>
                            );
                        })}
                    </dl>
                </li>
            ))}
        </ol>
    );
}
