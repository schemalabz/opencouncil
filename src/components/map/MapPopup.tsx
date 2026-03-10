import Icon, { iconMap } from "@/components/icon";
import Image from 'next/image';

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
        const meetingName = feature.properties?.meetingName;
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
            return remainingMinutes > 0 ? `${hours}ω ${remainingMinutes}λ` : `${hours} ώρα${hours > 1 ? 'ες' : ''}`;
        })() : null;

        return (
            <div className="bg-background/98 backdrop-blur-md rounded-xl shadow-xl overflow-hidden pointer-events-none border border-border/50 max-w-sm">
                <div className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <div
                            className="p-3 rounded-lg flex-shrink-0 shadow-sm flex items-center justify-center min-h-[80px] w-[60px]"
                            style={{ backgroundColor: topicColor ? topicColor + "15" : "#f3f4f6" }}
                        >
                            {topicIcon && (topicIcon in iconMap) ? (
                                <Icon
                                    name={topicIcon as keyof typeof iconMap}
                                    color={topicColor || "#6b7280"}
                                    size={24}
                                />
                            ) : (
                                <div
                                    className="w-6 h-6 rounded-full"
                                    style={{ backgroundColor: topicColor }}
                                />
                            )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                                {topicName && (
                                    <span
                                        className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
                                        style={{ backgroundColor: topicColor }}
                                    >
                                        {topicName}
                                    </span>
                                )}
                            </div>
                            <h4 className="text-sm font-semibold text-foreground leading-tight">{name}</h4>
                            {(cityName || locationText) && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                                    {cityName && (
                                        <>
                                            <Icon name="Building2" size={10} color="#9ca3af" />
                                            <span>{cityName}</span>
                                        </>
                                    )}
                                    {cityName && locationText && (
                                        <span className="mx-1">•</span>
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

                    <div className="grid grid-cols-2 gap-3 text-xs">
                        {formattedDate && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Icon name="Calendar" size={12} color="#9ca3af" />
                                <span className="line-clamp-1">{formattedDate}</span>
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
                            <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                                <Icon name="FileText" size={12} color="#9ca3af" />
                                <span>{meetingName}</span>
                            </div>
                        )}
                    </div>

                    <div className="pt-2 border-t border-border/30 text-center">
                        <p className="text-xs text-muted-foreground">
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
        <div className="bg-background/98 backdrop-blur-md rounded-xl shadow-xl overflow-hidden pointer-events-none border border-border/50 max-w-sm">
            <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12 flex-shrink-0">
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
                            <Icon name="Building2" size={48} color="#9ca3af" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-foreground leading-tight truncate">{name}</p>
                        {isSupported ? (
                            <div className="flex items-center gap-1 mt-1">
                                <Icon name="BadgeCheck" size={12} color="#16a34a" />
                                <span className="text-xs text-green-700">Υποστηριζόμενος Δήμος</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 mt-1">
                                <Icon name="BadgeInfo" size={12} color="#3b82f6" />
                                <span className="text-xs text-blue-600">
                                    {petitionCount > 0
                                        ? `${petitionCount} αιτήματα δημοτών`
                                        : "Δήμος χωρίς υποστήριξη"}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {!isSupported && petitionCount > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-border/30">
                        <div className="flex justify-between text-[10px] font-medium">
                            <span className="text-muted-foreground">Πρόοδος αιτημάτων</span>
                            <span className="text-blue-600">{Math.min(100, Math.round((petitionCount / 50) * 100))}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 transition-all duration-500"
                                style={{ width: `${Math.min(100, (petitionCount / 50) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                {isSupported && meetingsCount > 0 && (
                    <div className="pt-2 border-t border-border/30 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Icon name="Calendar" size={12} color="#9ca3af" />
                            <span>Συνεδριάσεις: <span className="font-medium text-foreground">{meetingsCount}</span></span>
                        </div>
                    </div>
                )}

                <p className="text-xs text-muted-foreground pt-1 pl-0 border-t border-border/30 mt-2">
                    {isSupported
                        ? 'Κάντε κλικ για προβολή του δήμου'
                        : 'Κάντε κλικ για να ζητήσετε την προσθήκη'
                    }
                </p>
            </div>
        </div>
    );
}
