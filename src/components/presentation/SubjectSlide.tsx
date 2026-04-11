"use client";

import { ImageOrInitials } from "@/components/ImageOrInitials";
import { SubjectWithRelations } from "@/lib/db/subject";
import { filterActiveRoles, getPartyFromRoles } from "@/lib/utils";
import SpeakerTimer from "./SpeakerTimer";

interface SubjectSlideProps {
    subject: SubjectWithRelations;
}

export default function SubjectSlide({ subject }: SubjectSlideProps) {
    const introducer = subject.introducedBy;
    const introducerParty = introducer ? getPartyFromRoles(introducer.roles) : null;
    const firstRoleName = introducer
        ? filterActiveRoles(introducer.roles).find((r) => r.name)?.name ?? null
        : null;
    const introducerSubtitle = [firstRoleName, introducerParty?.name]
        .filter(Boolean)
        .join(" · ");

    return (
        <div className="relative h-full w-full flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center px-[4vw] gap-[3vh] min-h-0">
                <div className="text-[6vw] font-bold leading-[1] text-left max-w-[92%] flex items-center gap-[0.3em]">
                    {subject.agendaItemIndex !== null && (
                        <span
                            className="inline-flex items-center justify-center rounded-full bg-foreground text-background tabular-nums shrink-0"
                            style={{
                                width: "1.3em",
                                height: "1.3em",
                                fontSize: "0.75em",
                                lineHeight: 1,
                            }}
                        >
                            {subject.agendaItemIndex}
                        </span>
                    )}
                    <span>{subject.name}</span>
                </div>

                {introducer && (
                    <div className="flex items-center gap-5">
                        <div className="w-[9vh] h-[9vh] shrink-0">
                            <ImageOrInitials
                                imageUrl={introducer.image}
                                width={100}
                                height={100}
                                name={introducer.name}
                                color={introducerParty?.colorHex}
                            />
                        </div>
                        <div className="flex flex-col items-start">
                            <div className="text-[1.6vh] uppercase tracking-wider text-muted-foreground">
                                Εισηγητής
                            </div>
                            <div className="text-[3vh] font-semibold leading-tight">{introducer.name}</div>
                            {introducerSubtitle && (
                                <div className="text-[2vh] text-muted-foreground leading-tight">
                                    {introducerSubtitle}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-center h-[28vh] border-t border-border/40 flex-shrink-0">
                <SpeakerTimer />
            </div>
        </div>
    );
}
