'use client';

import { useState, useRef, useEffect } from 'react';
import { X, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Updated Location type to match SignupPageContent.tsx
type Location = {
    id: string;
    text: string;
    coordinates: [number, number];
};

interface LocationSelectorProps {
    selectedLocations: Location[];
    onSelect: (location: Location) => void;
    onRemove: (locationId: string) => void;
}

export function LocationSelector({
    selectedLocations,
    onSelect,
    onRemove
}: LocationSelectorProps) {
    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState<Location[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Simulate fetching location suggestions
    // In a real implementation, this would use the Google Places API
    useEffect(() => {
        if (inputValue.trim().length > 2) {
            setIsLoading(true);
            // Simulate API delay
            const timeoutId = setTimeout(() => {
                // Mock location suggestions based on input
                const mockSuggestions: Location[] = [
                    {
                        id: `location-${Date.now()}-1`,
                        text: `${inputValue} - Οδός Α`,
                        coordinates: [23.7275 + Math.random() * 0.1, 37.9838 + Math.random() * 0.1]
                    },
                    {
                        id: `location-${Date.now()}-2`,
                        text: `${inputValue} - Οδός Β`,
                        coordinates: [23.7275 + Math.random() * 0.1, 37.9838 + Math.random() * 0.1]
                    },
                    {
                        id: `location-${Date.now()}-3`,
                        text: `${inputValue} - Πλατεία`,
                        coordinates: [23.7275 + Math.random() * 0.1, 37.9838 + Math.random() * 0.1]
                    }
                ];

                setSuggestions(mockSuggestions);
                setIsLoading(false);
            }, 500);

            return () => clearTimeout(timeoutId);
        } else {
            setSuggestions([]);
        }
    }, [inputValue]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    const handleSelectLocation = (location: Location) => {
        onSelect(location);
        setInputValue('');
        setSuggestions([]);
        inputRef.current?.focus();
    };

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-lg font-medium mb-3">Τοποθεσίες ενδιαφέροντος</h3>
                <p className="text-sm text-gray-700 mb-3">
                    Επιλέξτε τοποθεσίες για τις οποίες θέλετε να λαμβάνετε ενημερώσεις
                </p>
            </div>

            <div className="relative">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                            ref={inputRef}
                            type="text"
                            placeholder="Αναζητήστε διεύθυνση..."
                            className="pl-10 py-5"
                            value={inputValue}
                            onChange={handleInputChange}
                        />
                        {isLoading && (
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                            </div>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setInputValue('')}
                        className={`${inputValue ? 'visible' : 'invisible'}`}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {suggestions.length > 0 && (
                    <div className="absolute z-10 mt-2 w-full bg-white rounded-md shadow-lg max-h-60 overflow-auto">
                        <ul className="py-2">
                            {suggestions.map((suggestion) => (
                                <li
                                    key={suggestion.id}
                                    className="px-4 py-3 hover:bg-gray-100 cursor-pointer flex items-center gap-3"
                                    onClick={() => handleSelectLocation(suggestion)}
                                >
                                    <MapPin className="h-4 w-4 text-gray-500" />
                                    <span>{suggestion.text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {selectedLocations.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                    {selectedLocations.map((location) => (
                        <div
                            key={location.id}
                            className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm"
                        >
                            <MapPin className="h-3 w-3" />
                            <span className="truncate max-w-[150px]">{location.text}</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 p-0 hover:bg-gray-200 rounded-full"
                                onClick={() => onRemove(location.id)}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
} 