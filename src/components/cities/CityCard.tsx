import { City } from '@prisma/client';
import { Link } from '@/i18n/routing';
import Image from 'next/image';
import { Card, CardContent } from "../ui/card";

interface CityCardProps {
    city: City;
}

export function CityCard({ city }: CityCardProps) {
    return (
        <Link href={`/${city.id}`} className="unstyled">
            <Card className="relative h-48 overflow-hidden transition-transform hover:scale-105">
                <div className="absolute inset-0 flex items-center justify-center">
                    <Image
                        src={city.logoImage || '/default-city-logo.jpg'}
                        alt={`${city.name} logo`}
                        layout="fill"
                        objectFit="contain"
                        className="opacity-50"
                    />
                </div>
                <CardContent className="relative h-full flex justify-center">
                    <h3 className="text-2xl font-bold text-center z-10">{city.name}</h3>
                </CardContent>
            </Card>
        </Link>
    );
}