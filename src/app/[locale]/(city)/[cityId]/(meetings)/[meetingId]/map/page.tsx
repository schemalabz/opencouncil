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

    // Build features array, including city polygon only if geometry exists
    const cityFeature = city.geometry ? [{
        type: 'Feature' as const,
        id: city.id,
        geometry: city.geometry,
        properties: {
            featureType: 'city' as const,
            name: city.name,
            name_en: city.name_en
        },
        style: {
            fillColor: '#627BBC',
            fillOpacity: 0.2,
            strokeColor: '#627BBC',
            strokeWidth: 2,
        }
    }] : [];

    return (
        <div className="absolute inset-0">
            <Map
                className="w-full h-full"
                features={[
                    ...cityFeature,
                    ...subjectFeatures
                ]}
                animateRotation={false}
                onFeatureClick={(feature: Feature) => {
                    if (feature.properties?.subjectId && feature.properties?.type !== 'city') {
                        router.push(`subjects/${feature.properties.subjectId}`);
                    }
                }}
            />
        </div>
    );
}
