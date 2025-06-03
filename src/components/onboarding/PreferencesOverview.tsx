import React from 'react';
import { MapPin, Tag, User, Home, UserCheck } from 'lucide-react';
import { Location } from '@/lib/types/onboarding';
import { Topic } from '@prisma/client';

interface PreferencesOverviewProps {
  locations?: Location[];
  topics?: Topic[];
  petitionData?: {
    name: string;
    isResident: boolean;
    isCitizen: boolean;
  };
}

export function PreferencesOverview({ 
  locations, 
  topics, 
  petitionData
}: PreferencesOverviewProps) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      {locations && locations.length > 0 && (
        <div className="flex items-start gap-2 mb-3">
          <div className="mt-0.5 text-gray-500">
            <MapPin className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Τοποθεσίες</p>
            <ul className="text-sm text-gray-700">
              {locations.map((location, idx) => (
                <li key={idx}>{location.text}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {topics && topics.length > 0 && (
        <div className="flex items-start gap-2">
          <div className="mt-0.5 text-gray-500">
            <Tag className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Θέματα</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {topics.map((topic, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                  style={{
                    backgroundColor: `${topic.colorHex}20`,
                    color: topic.colorHex
                  }}
                >
                  {topic.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {petitionData && (
        <div className="flex items-start gap-2">
          <div className="mt-0.5 text-gray-500">
            <User className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Στοιχεία αιτήματος</p>
            <p className="text-sm text-gray-700">Όνομα: {petitionData.name}</p>
            <div className="flex gap-2 mt-2">
              {petitionData.isResident && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-800">
                  <span className="mr-1"><Home className="h-4 w-4" /></span>Κάτοικος
                </span>
              )}
              {petitionData.isCitizen && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-800">
                  <span className="mr-1"><UserCheck className="h-4 w-4" /></span>Δημότης
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 