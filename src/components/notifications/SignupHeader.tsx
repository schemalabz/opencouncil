'use client';

import { ArrowLeft, Menu, ChevronRight, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import Image from 'next/image';
import UserDropdown from '@/components/layout/user-dropdown';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useState } from 'react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { useRouter } from 'next/navigation';

// Updated City type to match SignupPageContent.tsx
type City = {
    id: string;
    name: string;
    name_en: string;
    name_municipality: string;
    name_municipality_en: string;
    logoImage: string | null;
    timezone: string;
    createdAt?: Date;
    updatedAt?: Date;
    officialSupport: boolean;
    isListed?: boolean;
    isPending?: boolean;
    authorityType?: string;
    wikipediaId?: string | null;
    geometry?: any;
    supportsNotifications: boolean;
};

// Define path element type
interface PathElement {
    name: string;
    link: string;
    city?: City;
    description?: string;
}

// Export the enum so it can be used in other components
export enum SignupStage {
    SELECT_MUNICIPALITY = 0,
    LOCATION_TOPIC_SELECTION = 1,
    UNSUPPORTED_MUNICIPALITY = 2,
    USER_REGISTRATION = 3,
    COMPLETE = 4,
}

interface SignupHeaderProps {
    city: City | null;
    stage: SignupStage;
    onBack: () => void;
}

export function SignupHeader({ city, stage, onBack }: SignupHeaderProps) {
    const { scrollY } = useScroll();
    const blurBackgroundOpacity = useTransform(scrollY, [0, 50], [0, 1], { clamp: true });
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const router = useRouter();

    // Determine if back button should be shown
    const showBackButton = stage !== SignupStage.SELECT_MUNICIPALITY;

    return (
        <motion.header
            className="sticky top-0 z-50 w-full flex justify-between items-stretch min-h-[65px] h-16 relative bg-white border-b"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <motion.div
                className="absolute inset-0 backdrop-blur-sm"
                style={{ opacity: blurBackgroundOpacity }}
            />

            <div className="container mx-auto h-full">
                <div className="flex items-center justify-between w-full px-2 sm:px-4 relative h-full">
                    {/* Left section: Back button & Logo */}
                    <div className="flex items-center gap-2 z-10 h-full">
                        {showBackButton && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onBack}
                                className="text-foreground mr-0"
                            >
                                <ArrowLeft size={18} />
                            </Button>
                        )}
                        <Link href="/" className="flex items-center gap-2 shrink-0 h-full py-2">
                            <div className="relative h-full aspect-square p-0">
                                <Image
                                    src="/logo.png"
                                    alt="logo"
                                    fill
                                    sizes="(max-width: 768px) 80px, 80px"
                                    style={{ objectFit: 'contain' }}
                                    className="transition-transform"
                                />
                            </div>
                        </Link>
                    </div>

                    {/* Center Section: Main Title */}
                    <div className="absolute left-0 right-0 mx-auto flex justify-center items-center pointer-events-none">
                        <div className="pointer-events-auto text-center">
                            <span className="text-lg font-medium">Ενημερώσεις</span>
                            {stage > SignupStage.SELECT_MUNICIPALITY && (
                                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                                    <span>Εγγραφή σε ενημερώσεις</span>
                                    {city && (
                                        <>
                                            <ChevronRight className="h-3 w-3" />
                                            <span className="truncate max-w-[120px]">{city.name}</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Section: City Logo, User & Menu */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                        {/* City Logo */}
                        {city?.logoImage && stage > SignupStage.SELECT_MUNICIPALITY && (
                            <div className="hidden sm:block relative h-12 w-12 flex-shrink-0">
                                <Image
                                    src={city.logoImage}
                                    alt={city.name}
                                    fill
                                    sizes="48px"
                                    style={{ objectFit: 'contain' }}
                                    priority
                                />
                            </div>
                        )}

                        {/* User Dropdown */}
                        <div className="flex-shrink-0">
                            <UserDropdown />
                        </div>

                        {/* Mobile Menu */}
                        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className="md:hidden">
                                    <Menu size={18} />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="right">
                                <SheetHeader>
                                    <SheetTitle>Μενού</SheetTitle>
                                </SheetHeader>
                                <div className="py-4">
                                    <div className="space-y-4">
                                        <Link
                                            href="/"
                                            className="block p-2 hover:bg-gray-100 rounded-md"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            Αρχική
                                        </Link>
                                        <Link
                                            href="/signup"
                                            className="block p-2 hover:bg-gray-100 rounded-md"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            Εγγραφή σε ενημερώσεις
                                        </Link>
                                        {city && (
                                            <div>
                                                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                                                    Επιλεγμένος Δήμος:
                                                </h3>
                                                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                                                    {city.logoImage && (
                                                        <div className="relative h-10 w-10 flex-shrink-0">
                                                            <Image
                                                                src={city.logoImage}
                                                                alt={city.name}
                                                                fill
                                                                sizes="40px"
                                                                style={{ objectFit: 'contain' }}
                                                            />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="font-medium">{city.name}</div>
                                                        <div className="text-xs text-muted-foreground">{city.name_municipality}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </div>
        </motion.header>
    );
} 