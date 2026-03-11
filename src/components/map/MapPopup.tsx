import Icon, { iconMap } from "@/components/icon";
import Image from 'next/image';
import { formatMeetingTitle } from '@/lib/utils';

interface MapPopupProps {
    feature: GeoJSON.Feature;
}

export function MapPopup({ feature }: MapPopupProps) {
    const featureType = feature.properties?.featureType;

    // Subject popup
    if (featureType === 'subject') {
        const name = feature.properties?.name;
        const _description = feature.properties?.description;
        const locationText = feature.properties?.locationText;
        const topicName = feature.properties?.topicName;
        const topicColor = feature.properties?.topicColor;
        const topicIcon = feature.properties?.topicIcon;
        const meetingDate = feature.properties?.meetingDate;
        const rawMeetingName = feature.properties?.meetingName;
        const meetingName = formatMeetingTitle(rawMeetingName);
        const discussionTimeSeconds = feature.properties?.discussionTimeSeconds;
        const speakerCount = feature.properties?.speakerCount;
        const cityName = feature.properties?.cityName;

        // Format meeting date
        const formattedDate = meetingDate ? new Date(meetingDate).toLocaleDateString('el-GR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : null;

        // Format discussion time
        const formattedTime = discussionTimeSeconds ? (() => {
            const minutes = Math.floor(discussionTimeSeconds / 60);
            if (minutes < 60) return `${minutes} λεπτά`;
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            const hourText = hours === 1 ? 'ώρα' : 'ώρες';
            return remainingMinutes > 0
                ? `${hours} ${hourText} ${remainingMinutes} λεπτά`
                : `${hours} ${hourText}`;
        })() : null;

        return (
            <div className="bg-background/98 backdrop-blur-md rounded-xl shadow-xl overflow-hidden pointer-events-none border border-border/50 w-[280px] sm:w-auto sm:max-w-sm transition-all duration-300">
                <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                    <div className="flex items-start gap-2 sm:gap-3">
                        <div
                            className="p-2 sm:p-3 rounded-lg flex-shrink-0 shadow-sm flex items-center justify-center min-h-[60px] sm:min-h-[80px] w-[48px] sm:w-[60px]"
                            style={{ backgroundColor: topicColor ? topicColor + "15" : "#f3f4f6" }}
                        >
                            {topicIcon && (topicIcon in iconMap) ? (
                                <Icon
                                    name={topicIcon as keyof typeof iconMap}
                                    color={topicColor || "#6b7280"}
                                    size={20}
                                />
                            ) : (
                                <div
                                    className="w-5 h-5 rounded-full"
                                    style={{ backgroundColor: topicColor }}
                                />
                            )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
                            <div className="flex items-center gap-2">
                                {topicName && (
                                    <span
                                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
                                        style={{ backgroundColor: topicColor }}
                                    >
                                        {topicName}
                                    </span>
                                )}
                            </div>
                            <h4 className="text-xs sm:text-sm font-semibold text-foreground leading-tight line-clamp-2">{name}</h4>
                            {(cityName || locationText) && (
                                <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                                    {cityName && (
                                        <>
                                            <Icon name="Building2" size={10} color="#9ca3af" />
                                            <span>{cityName}</span>
                                        </>
                                    )}
                                    {cityName && locationText && (
                                        <span className="mx-0.5 sm:mx-1">•</span>
                                    )}
                                    {locationText && (
                                        <>
                                            <Icon name="MapPin" size={10} color="#9ca3af" />
                                            <span>{locationText}</span>
                                        </>
                                    )}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-3 text-[10px] sm:text-xs">
                        {formattedDate && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Icon name="Calendar" size={12} color="#9ca3af" />
                                <span className="truncate">{formattedDate}</span>
                            </div>
                        )}

                        {formattedTime && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Icon name="Clock" size={12} color="#9ca3af" />
                                <span>{formattedTime}</span>
                            </div>
                        )}

                        {speakerCount !== undefined && speakerCount > 0 && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Icon name="Users" size={12} color="#9ca3af" />
                                <span>{speakerCount} {speakerCount === 1 ? 'ομιλητής' : 'ομιλητές'}</span>
                            </div>
                        )}

                        {meetingName && (
                            <div className="flex items-center gap-1.5 text-muted-foreground sm:col-span-2">
                                <Icon name="FileText" size={12} color="#9ca3af" />
                                <span className="truncate">{meetingName}</span>
                            </div>
                        )}
                    </div>

                    <div className="pt-1.5 sm:pt-2 border-t border-border/30 text-center">
                        <p className="text-[10px] text-muted-foreground">
                            Κάντε κλικ για λεπτομέρειες
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // City popup
    const name = feature.properties?.name;
    const isSupported = feature.properties?.officialSupport;
    const logoImage = feature.properties?.logoImage;
    const meetingsCount = feature.properties?.meetingsCount || 0;
    const petitionCount = feature.properties?.petitionCount || 0;

    return (
        <div className="bg-background/98 backdrop-blur-md rounded-xl shadow-xl overflow-hidden pointer-events-none border border-border/50 w-[240px] sm:w-auto sm:max-w-sm transition-all duration-300">
            <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                <div className="flex items-center gap-3">
                    <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0">
                        {logoImage ? (
                            <Image
                                src={logoImage}
                                alt={`${name} logo`}
                                width={48}
                                height={48}
                                className="object-contain"
                                unoptimized
                            />
                        ) : (
                            <Icon name="Building2" size={40} color="#9ca3af" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-base font-semibold text-foreground leading-tight truncate">{name}</p>
                        {isSupported ? (
                            <div className="flex items-center gap-1 mt-0.5 sm:mt-1">
                                <Icon name="BadgeCheck" size={12} color="#16a34a" />
                                <span className="text-[10px] sm:text-xs text-green-700">Υποστηριζόμενος Δήμος</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 mt-0.5 sm:mt-1">
                                <Icon name="BadgeInfo" size={12} color="#3b82f6" />
                                <span className="text-[10px] sm:text-xs text-blue-600">
                                    {petitionCount > 0
                                        ? `${petitionCount} αιτήματα`
                                        : "Χωρίς υποστήριξη"}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {!isSupported && petitionCount > 0 && (
                    <div className="space-y-1 pt-1.5 sm:pt-2 border-t border-border/30">
                        <div className="flex justify-between text-[9px] sm:text-[10px] font-medium">
                            <span className="text-muted-foreground">Πρόοδος</span>
                            <span className="text-blue-600">{Math.min(100, Math.round((petitionCount / 50) * 100))}%</span>
                        </div>
                        <div className="h-1 w-full bg-blue-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 transition-all duration-500"
                                style={{ width: `${Math.min(100, (petitionCount / 50) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                {isSupported && meetingsCount > 0 && (
                    <div className="pt-1.5 sm:pt-2 border-t border-border/30 text-[10px] sm:text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Icon name="Calendar" size={12} color="#9ca3af" />
                            <span>Συνεδριάσεις: <span className="font-medium text-foreground">{meetingsCount}</span></span>
                        </div>
                    </div>
                )}

                <p className="text-[10px] sm:text-xs text-muted-foreground pt-1.5 sm:pt-2 border-t border-border/30 mt-1 sm:mt-2">
                    {isSupported
                        ? 'Κάντε κλικ για προβολή'
                        : 'Κάντε κλικ για προσθήκη'
                    }
                </p>
            </div>
        </div>
    );
}
