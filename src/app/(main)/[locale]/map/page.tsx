import Map from "@/components/map/map";
import { getCities, getCitiesWithGeometry } from "@/lib/db/cities";

export default async function MapPage() {
    const cities = await getCities({ includeUnlisted: true });
    const citiesWithGeometry = await getCitiesWithGeometry(cities);
    console.log(`Have ${cities.length} cities`);
    console.log(cities.map(city => city.name));
    console.log(citiesWithGeometry.map(city => city.geometry));

    return (
        <div className="fixed inset-0">
            <Map
                cities={citiesWithGeometry}
                animateRotation={false}
                center={[23.7275, 37.9838]} // Center on Athens
                zoom={7} // Show all of Greece
                pitch={0} // Top-down view for better polygon visibility
            />
        </div>
    );
}
