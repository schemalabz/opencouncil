import { Bell, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CityMinimalWithCounts } from '@/lib/db/cities';

/**
 * A city row for the shared `Combobox`. The bell marks a municipality that can
 * send notifications; every other one only offers the petition page. Both city
 * pickers show the same rows, so the two lists stay recognisable as one thing.
 */
export function CityComboboxItem({ item }: { item: CityMinimalWithCounts }) {
    return (
        <div className="flex items-center">
            <div
                className={cn(
                    "w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center mr-2 shrink-0",
                    item.supportsNotifications ? "bg-orange-100" : "bg-gray-100"
                )}
            >
                {/* Important, because Combobox sizes every icon in a row to h-5/w-5,
                    which would fill the chip and hide the colour behind it. */}
                {item.supportsNotifications ? (
                    <Bell className="!h-3 !w-3" />
                ) : (
                    <MapPin className="!h-3 !w-3" />
                )}
            </div>
            <div className="min-w-0">
                <div className="font-medium text-sm sm:text-base">{item.name}</div>
                <div className="text-xs text-gray-500">{item.name_municipality}</div>
            </div>
        </div>
    );
}
