"use client";

import Map from "@/components/map/map";

interface ConsultationMapProps {
    className?: string;
}

export default function ConsultationMap({ className }: ConsultationMapProps) {
    // For now, just render an empty map placeholder
    // This will be expanded to show consultation geographic areas
    return (
        <div className={className}>
            <Map
                center={[23.7275, 37.9755]} // Athens coordinates
                zoom={11}
                animateRotation={false}
                features={[]}
                className="w-full h-full"
            />
        </div>
    );
} 