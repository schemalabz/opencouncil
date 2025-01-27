"use client"
import Map from "@/components/map/map";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { subjectToMapFeature } from "@/lib/utils";
import { useRouter } from "next/navigation";
import type { Feature } from 'geojson';

export default function MapPage() {
    const { city, meeting, subjects } = useCouncilMeetingData();
    const router = useRouter();

    // Convert all subjects with locations to map features
    const subjectFeatures = subjects
        .map(subjectToMapFeature)
        .filter((f): f is NonNullable<ReturnType<typeof subjectToMapFeature>> => f !== null);

    return (
        <div className="absolute inset-0">
            <Map
                className="w-full h-full"
                features={[
                    {
                        id: city.id,
                        geometry: city.geometry,
                        properties: {
                            name: city.name,
                            name_en: city.name_en
                        },
                        style: {
                            fillColor: '#627BBC',
                            fillOpacity: 0.2,
                            strokeColor: '#627BBC',
                            strokeWidth: 2,
                        }
                    },
                    ...subjectFeatures
                ]}
                animateRotation={false}
                onFeatureClick={(feature: Feature) => {
                    if (feature.properties?.subjectId) {
                        router.push(`subjects/${feature.properties.subjectId}`);
                    }
                }}
            />
        </div>
    );
}
