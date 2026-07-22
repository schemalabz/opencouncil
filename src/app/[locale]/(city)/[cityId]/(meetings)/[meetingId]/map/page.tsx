"use client"
import Map from "@/components/map/DynamicMap";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { subjectToMapFeature } from "@/lib/utils";
import { getRealmDefaultMapView } from "@/lib/realm";
import { useRouter } from "next/navigation";
import type { Feature } from 'geojson';

export default function MapPage() {
    const { city, meeting, subjects } = useCouncilMeetingData();
    const router = useRouter();

    // When the city has no stored geometry, fall back to its realm's center
    // (e.g. France) so the map doesn't default to Greece. A city with geometry
    // zooms to its boundary via zoomToGeometry below.
    const fallbackView = getRealmDefaultMapView(city.realm);

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
                            name_en: city.name_en,
                            type: 'city'
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
                center={city.geometry ? undefined : fallbackView.center}
                zoom={city.geometry ? undefined : fallbackView.zoom}
                animateRotation={false}
                zoomToGeometry={city.geometry}
                zoomPadding={120}
                onFeatureClick={(feature: Feature) => {
                    if (feature.properties?.subjectId && feature.properties?.type !== 'city') {
                        router.push(`subjects/${feature.properties.subjectId}`);
                    }
                }}
            />
        </div>
    );
}
