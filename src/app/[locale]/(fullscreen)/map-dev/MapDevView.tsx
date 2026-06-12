"use client"

import { useState } from 'react';
import CivicMap from '@/components/map/civic/CivicMap';
import type { MapMunicipality, MapSubject } from '@/lib/map/types';

interface MapDevViewProps {
    municipalities: MapMunicipality[];
    subjects: MapSubject[];
}

export default function MapDevView({ municipalities, subjects }: MapDevViewProps) {
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
    const [lastEvent, setLastEvent] = useState<string>('—');
    const [visibleCount, setVisibleCount] = useState(subjects.length);

    return (
        <div className="fixed inset-0 top-16">
            <CivicMap
                className="h-full w-full"
                subjects={subjects}
                municipalities={municipalities}
                camera={{ fitTo: 'subjects', urlHash: true }}
                selectedSubjectId={selectedSubjectId}
                onSubjectSelect={subject => {
                    setSelectedSubjectId(subject?.id ?? null);
                    setLastEvent(subject ? `subject: ${subject.name}` : 'cleared');
                }}
                onMunicipalityClick={municipality => {
                    setLastEvent(`municipality: ${municipality.name} (${municipality.petitionCount} petitions)`);
                }}
                onVisibleSubjectsChange={ids => setVisibleCount(ids.length)}
                ariaLabel="Dev map harness"
            >
                <div className="absolute left-4 top-4 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-md">
                    <div>{subjects.length} subjects · {visibleCount} in view</div>
                    <div className="text-muted-foreground">{lastEvent}</div>
                </div>
            </CivicMap>
        </div>
    );
}
