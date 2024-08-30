import { City } from '@prisma/client';


export default function CityC({ city, editable }: { city: City, editable: boolean }) {
    return <div>
        <h1>{city.name}</h1>
    </div>
}