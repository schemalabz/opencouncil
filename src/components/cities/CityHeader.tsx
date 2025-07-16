"use client";
import { City, CityMessage } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import FormSheet from '@/components/FormSheet';
import CityForm from '@/components/cities/CityForm';
import { BadgeCheck, BadgeX, Building2, Bell, Database } from 'lucide-react';
import { Search } from "lucide-react";
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useSession } from 'next-auth/react';
import { getUserPreferences } from '@/lib/db/notifications';
import { CityMessage as CityMessageComponent } from '@/components/cities/CityMessage';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import CityCreator from '@/components/cities/CityCreator';
import { IS_DEV } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type CityHeaderProps = {
    city: City,
    councilMeetingsCount: number,
    cityMessage: CityMessage | null,
    hasNoData?: boolean,
};

export function CityHeader({ city, councilMeetingsCount, cityMessage, hasNoData = false }: CityHeaderProps) {
    const t = useTranslations('City');
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [isCityCreatorOpen, setIsCityCreatorOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [canEdit, setCanEdit] = useState(false);
    const [hasNotifications, setHasNotifications] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const router = useRouter();
    const { data: session } = useSession();
    const { toast } = useToast();

    const isSuperAdmin = session?.user?.isSuperAdmin;

    // Show message if it exists and is active, or if user is superadmin (for preview)
    const shouldShowMessage = cityMessage && (cityMessage.isActive || isSuperAdmin);

    useEffect(() => {
        const checkEditPermissions = async () => {
            const hasPermission = await isUserAuthorizedToEdit({ cityId: city.id });
            setCanEdit(hasPermission);
        };
        checkEditPermissions();
    }, [city.id]);

    useEffect(() => {
        const checkNotifications = async () => {
            if (!session?.user) return;

            try {
                const preferences = await getUserPreferences();
                const hasCityNotifications = preferences.some(
                    pref => pref.cityId === city.id && !pref.isPetition
                );
                setHasNotifications(hasCityNotifications);
            } catch (error) {
                console.error('Error checking notifications:', error);
            }
        };

        checkNotifications();
    }, [city.id, session?.user]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        params.set('query', searchQuery);
        params.set('cityId', city.id);
        router.push(`/search?${params.toString()}`);
    };

    const handleNotificationSignup = () => {
        router.push(`/${city.id}/notifications`);
    };

    const handleCityCreatorSuccess = () => {
        setIsCityCreatorOpen(false);
        // Refresh the page to show the updated city
        window.location.reload();
    };

    const handleResetCity = async () => {
        if (!confirm('Are you sure you want to reset this city? This will delete ALL data (meetings, people, parties, roles, etc.) and set the city back to pending status. This action cannot be undone.')) {
            return;
        }

        setIsResetting(true);

        try {
            const response = await fetch(`/api/cities/${city.id}/reset`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to reset city');
            }

            toast({
                title: 'Success',
                description: 'City has been reset successfully',
            });

            // Refresh the page to show the updated city
            window.location.reload();
        } catch (err) {
            toast({
                title: 'Error',
                description: err instanceof Error ? err.message : 'Failed to reset city',
                variant: 'destructive',
            });
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <>
            {/* Hero Section */}
            <div className="flex flex-col md:flex-row items-center justify-between mb-8 md:mb-12 gap-6">
                <motion.div
                    className="flex flex-col md:flex-row items-center gap-6 md:space-x-8"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="relative w-32 h-32 md:w-40 md:h-40">
                        {city.logoImage ? (
                            <Image
                                src={city.logoImage}
                                alt={`${city.name} logo`}
                                fill
                                className="object-contain"
                            />
                        ) : (
                            <Building2 className="w-full h-full text-gray-400" />
                        )}
                    </div>
                    <div className="text-center md:text-left space-y-3">
                        <motion.h1
                            className="text-4xl md:text-5xl font-normal tracking-tight"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            {city.name}
                        </motion.h1>
                        <motion.div
                            className="text-lg text-muted-foreground"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                        >
                            {t('councilMeetingsTracked', { count: councilMeetingsCount })}
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                        >
                            {city.officialSupport ? (
                                <Badge variant="secondary" className="mt-2 gap-2 bg-green-100/80 text-green-800 hover:bg-green-100">
                                    <BadgeCheck className="w-4 h-4" />
                                    <span>Με την υποστήριξη {city.authorityType == "municipality" ? "του δήμου" : "της περιφέρειας"}</span>
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="mt-2 gap-2 text-muted-foreground">
                                    <BadgeX className="w-4 h-4" />
                                    <span>Χωρίς επίσημη υποστήριξη {city.authorityType == "municipality" ? "του δήμου" : "της περιφέρειας"}</span>
                                </Badge>
                            )}
                        </motion.div>
                    </div>
                </motion.div>
                <motion.div
                    className="flex flex-col items-center md:items-end gap-4"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                >
                    <div className="flex gap-2">
                        {canEdit && (
                            <FormSheet
                                FormComponent={CityForm}
                                formProps={{ city, cityMessage, onSuccess: () => setIsSheetOpen(false) }}
                                title={t('editCity')}
                                type="edit"
                            />
                        )}
                        {isSuperAdmin && (city.isPending || hasNoData) && (
                            <Sheet open={isCityCreatorOpen} onOpenChange={setIsCityCreatorOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <Database className="w-4 h-4 mr-2" />
                                        Import Data
                                    </Button>
                                </SheetTrigger>
                                <SheetContent className="max-w-4xl w-full sm:max-w-4xl overflow-y-auto">
                                    <SheetHeader>
                                        <SheetTitle>City Creator</SheetTitle>
                                        <SheetDescription>
                                            Populate {city.name} with municipal data including parties, people, and roles.
                                        </SheetDescription>
                                    </SheetHeader>
                                    <div className="mt-6">
                                        <CityCreator
                                            cityId={city.id}
                                            cityName={city.name}
                                            onSuccess={handleCityCreatorSuccess}
                                            onCancel={() => setIsCityCreatorOpen(false)}
                                        />
                                    </div>
                                </SheetContent>
                            </Sheet>
                        )}
                        {IS_DEV && isSuperAdmin && !city.isPending && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleResetCity}
                                disabled={isResetting}
                            >
                                {isResetting ? <Database className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
                                Reset City
                            </Button>
                        )}
                    </div>
                    {city.supportsNotifications && (
                        <Button
                            onClick={handleNotificationSignup}
                            size="xl"
                            className="group transition-all duration-300"
                        >
                            <div className="relative z-10 flex items-center gap-2">
                                <Bell className="w-5 h-5" />
                                <span className="font-medium">
                                    {hasNotifications ? 'Διαχείριση ειδοποιήσεων' : 'Ενεργοποίηση ειδοποιήσεων'}
                                </span>
                            </div>
                            <motion.div
                                className="absolute inset-0 rounded-xl bg-[hsl(var(--orange))] opacity-0 group-hover:opacity-10 transition-opacity"
                                whileHover={{
                                    boxShadow: "0 0 30px rgba(var(--orange), 0.5)"
                                }}
                            />
                        </Button>
                    )}
                    {!city.isPending && !city.officialSupport && (
                        <Button
                            onClick={() => router.push(`/${city.id}/petition`)}
                            size="xl"
                            className="group transition-all duration-300"
                        >
                            <div className="relative z-10 flex items-center gap-2">
                                <BadgeCheck className="w-5 h-5" />
                                <span className="font-medium">
                                    Ζητήστε την υποστήριξη του δήμου
                                </span>
                            </div>
                            <motion.div
                                className="absolute inset-0 rounded-xl bg-[hsl(var(--orange))] opacity-0 group-hover:opacity-10 transition-opacity"
                                whileHover={{
                                    boxShadow: "0 0 30px rgba(var(--orange), 0.5)"
                                }}
                            />
                        </Button>
                    )}
                </motion.div>
            </div>

            {/* City Messages - After hero but before search */}
            {shouldShowMessage && (
                <motion.div
                    className="mb-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55, duration: 0.5 }}
                >
                    <CityMessageComponent
                        message={cityMessage}
                        className={!cityMessage.isActive && isSuperAdmin ? "opacity-75 border-dashed" : ""}
                    />
                    {!cityMessage.isActive && isSuperAdmin && (
                        <motion.div
                            className="text-xs text-muted-foreground mb-2 text-center"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.7 }}
                        >
                            Preview: This message is inactive and only visible to superadmins
                        </motion.div>
                    )}
                </motion.div>
            )}

            {/* Search Section */}
            <motion.form
                onSubmit={handleSearch}
                className="relative mb-8 md:mb-12 max-w-2xl mx-auto"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
            >
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    placeholder={t('searchInCity', { cityName: city.name })}
                    className="pl-12 py-6 text-lg rounded-xl shadow-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </motion.form>
        </>
    );
} 