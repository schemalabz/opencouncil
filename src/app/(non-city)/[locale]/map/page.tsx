import Map, { MapFeature } from "@/components/map/map";
import { getCities, getCitiesWithGeometry } from "@/lib/db/cities";

export default async function MapPage() {
    const cities = await getCities({ includeUnlisted: true });
    const citiesWithGeometry = await getCitiesWithGeometry(cities);

    // Convert cities to map features
    const features: MapFeature[] = citiesWithGeometry.map(city => ({
        id: city.id,
        geometry: city.geometry,
        properties: {
            name: city.name,
            name_en: city.name_en
        },
        style: {
            fillColor: '#627BBC',
            fillOpacity: 0.4,
            strokeColor: '#627BBC',
            strokeWidth: 2,
            label: city.name
        }
    }));

    return (
        <div className="fixed inset-0">
            <Map
                features={features}
                animateRotation={false}
                center={[23.7275, 37.9838]} // Center on Athens
                zoom={7} // Show all of Greece
                pitch={0} // Top-down view for better polygon visibility
            />
        </div>
    );
}
