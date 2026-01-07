"use client";

import { useState, useEffect } from 'react';
import { Button } from "../ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { CheckCircle, CopyIcon, Share, ExternalLink, FileDown, LinkIcon, Eye, Loader2, Instagram } from "lucide-react";
import { useVideo } from './VideoProvider';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useShare } from '@/contexts/ShareContext';
import { formatTimestamp } from '@/lib/utils';
import { downloadFile } from '@/lib/export/meetings';


interface ShareDropdownProps {
    meetingId: string;
    cityId: string;
    className?: string;
}

export default function ShareDropdown({ meetingId, cityId, className }: ShareDropdownProps) {
    const [url, setUrl] = useState('');
    const [includeTimestamp, setIncludeTimestamp] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [ogImageUrl, setOgImageUrl] = useState('');
    const [imageLoading, setImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);
    const { currentTime } = useVideo();
    const { isOpen, targetTimestamp, shouldTriggerCopy, closeShareDropdown, resetCopyTrigger } = useShare();
    const pathname = usePathname();
    const t = useTranslations();
    const [internalOpen, setInternalOpen] = useState(false);

    useEffect(() => {
        setUrl(window.location.href);

        // Reset loading states when URL changes
        setImageLoading(true);
        setImageError(false);

        // Generate OG image URL based on current path
        const baseUrl = window.location.origin;
        const ogUrl = `${baseUrl}/api/og?cityId=${cityId}&meetingId=${meetingId}`;

        setOgImageUrl(ogUrl);
    }, [pathname, cityId, meetingId]);

    // Handle opening with a specific timestamp from context
    useEffect(() => {
        if (isOpen && targetTimestamp !== null) {
            setIncludeTimestamp(true);
        }
    }, [isOpen, targetTimestamp]);

    // Handle automatic copy trigger
    useEffect(() => {
        if (shouldTriggerCopy && isOpen && targetTimestamp !== null) {
            // When auto-copying, targetTimestamp is always provided by context
            const currentUrl = window.location.href;
            const urlObj = new URL(currentUrl);
            urlObj.searchParams.delete('t');
            urlObj.searchParams.set('t', Math.floor(targetTimestamp).toString());
            const shareableUrl = urlObj.toString();

            navigator.clipboard.writeText(shareableUrl).then(() => {
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 3000);
            }).catch(console.error);

            resetCopyTrigger();
        }
    }, [shouldTriggerCopy, isOpen, targetTimestamp, resetCopyTrigger]);

    const handleImageLoad = () => {
        setImageLoading(false);
        setImageError(false);
    };

    const handleImageError = () => {
        setImageLoading(false);
        setImageError(true);
    };

    const getShareableUrl = () => {
        const effectiveTime = targetTimestamp !== null ? targetTimestamp : currentTime;
        if (includeTimestamp && effectiveTime > 0) {
            // Parse the current URL and remove any existing timestamp parameters
            const urlObj = new URL(url);
            urlObj.searchParams.delete('t'); // Remove existing timestamp parameter
            urlObj.searchParams.set('t', Math.floor(effectiveTime).toString()); // Add new timestamp
            return urlObj.toString();
        }
        return url;
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(getShareableUrl());
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
    };

    const downloadImage = async (variant: 'story' | 'feed' | 'default') => {
        const baseUrl = window.location.origin;
        let imageUrl = `${baseUrl}/api/og?cityId=${cityId}&meetingId=${meetingId}`;
        
        // Add variant parameter if not default
        if (variant !== 'default') {
            imageUrl += `&variant=${variant}`;
        }

        setDownloading(variant);
        
        try {
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error('Failed to fetch image');
            }
            
            const blob = await response.blob();
            
            // Set filename based on variant
            const variantName = variant === 'story' ? 'story' : variant === 'feed' ? 'feed' : 'og';
            const fileName = `meeting-${variantName}-${meetingId}.png`;
            
            downloadFile(blob, fileName);
        } catch (error) {
            console.error('Error downloading image:', error);
        } finally {
            setDownloading(null);
        }
    };

    // Determine what's being shared based on the current path
    const getShareContext = () => {
        if (pathname.includes('/transcript')) {
            return 'την απομαγνητοφώνηση';
        } else if (pathname.includes('/statistics')) {
            return 'τα στατιστικά';
        } else if (pathname.includes('/subjects/')) {
            return 'αυτό το θέμα';
        } else if (pathname.includes('/highlights')) {
            return 'τα highlights';
        } else if (pathname.includes('/share')) {
            return 'τις επιλογές κοινοποίησης';
        } else if (pathname.includes('/settings')) {
            return 'τις ρυθμίσεις';
        } else if (pathname.includes('/admin')) {
            return 'τη σελίδα διαχείρισης';
        } else if (pathname.includes('/map')) {
            return 'τον χάρτη';
        } else {
            return 'τη συνεδρίαση';
        }
    };

    const shareContext = getShareContext();

    // Use a single controlled state - prioritize context state when active
    const dropdownOpen = isOpen || internalOpen;

    const handleOpenChange = (open: boolean) => {
        if (open) {
            // Opening - only allow internal state if not controlled by context
            if (!isOpen) {
                setInternalOpen(true);
            }
        } else {
            // Closing - close whichever state is active
            if (isOpen) {
                closeShareDropdown();
            } else {
                setInternalOpen(false);
            }
        }
    };

    return (
        <DropdownMenu open={dropdownOpen} onOpenChange={handleOpenChange}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={`w-9 h-9 rounded-full hover:bg-accent transition-colors shrink-0 ${className || ''}`}
                    title="Κοινοποίηση"
                >
                    <Share className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 sm:w-96" align="end">
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">Κοινοποίηση</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            Μοιραστείτε {shareContext}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <div className="p-3 space-y-4">
                    {/* URL Input and Copy Button */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">
                            Σύνδεσμος
                        </label>
                        <div className="flex gap-2">
                            <Input
                                value={getShareableUrl()}
                                readOnly
                                className="flex-grow text-xs font-mono h-9"
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                            />
                            <Button
                                onClick={copyToClipboard}
                                variant={copySuccess ? "default" : "outline"}
                                disabled={copySuccess}
                                className="flex-shrink-0 min-w-[80px] h-9"
                            >
                                {copySuccess ? (
                                    <>
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        <span className="text-xs">Αντιγράφηκε</span>
                                    </>
                                ) : (
                                    <>
                                        <CopyIcon className="w-3 h-3 mr-1" />
                                        <span className="text-xs">Αντιγραφή</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Timestamp Checkbox */}
                    {(currentTime > 0 || targetTimestamp !== null) && (
                        <div className="flex items-center space-x-2 p-2 rounded-md">
                            <Checkbox
                                id="timestamp"
                                checked={includeTimestamp}
                                onCheckedChange={(checked) => setIncludeTimestamp(checked as boolean)}
                            />
                            <label
                                htmlFor="timestamp"
                                className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1"
                            >
                                <span>Ξεκίνημα από το {formatTimestamp(targetTimestamp !== null ? targetTimestamp : currentTime)}</span>
                            </label>
                        </div>
                    )}
                </div>

                {ogImageUrl && (
                    <>
                        <DropdownMenuSeparator />
                        <div className="p-3">
                            <div className="rounded-lg border overflow-hidden bg-muted/50">
                                <div className="aspect-[1200/630] relative bg-muted/30">
                                    {imageLoading && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                                <span className="text-xs text-muted-foreground">Φόρτωση προεπισκόπησης...</span>
                                            </div>
                                        </div>
                                    )}
                                    {!imageError && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={ogImageUrl}
                                            alt="Preview"
                                            className={`w-full h-full object-cover transition-opacity duration-200 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
                                            onLoad={handleImageLoad}
                                            onError={handleImageError}
                                        />
                                    )}
                                    {imageError && !imageLoading && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                <Eye className="w-6 h-6" />
                                                <span className="text-xs">Προεπισκόπηση μη διαθέσιμη</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="p-2 bg-background">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Eye className="w-3 h-3" />
                                        <span>Προεπισκόπηση κοινοποίησης</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {ogImageUrl && !pathname.includes('/subjects/') && (
                    <>
                        <DropdownMenuSeparator />
                        <div className="p-3">
                            <label className="text-xs font-medium text-muted-foreground mb-2 block">
                                Εξαγωγή Προεπισκόπησης ως Εικόνα
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { type: 'story' as const, icon: Instagram, label: 'Story', ratio: '9:16' },
                                    { type: 'feed' as const, icon: FileDown, label: 'Post', ratio: '1:1' }
                                ].map(({ type, icon: Icon, label, ratio }) => (
                                    <Button
                                        key={type}
                                        onClick={() => downloadImage(type)}
                                        disabled={downloading !== null}
                                        variant="outline"
                                        size="sm"
                                        className="h-8 flex items-center gap-1.5"
                                    >
                                        {downloading === type ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Icon className="w-3 h-3" />
                                        )}
                                        <span className="text-xs">{label}</span>
                                        <span className="text-[10px] text-muted-foreground">({ratio})</span>
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}