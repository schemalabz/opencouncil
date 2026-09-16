// iOS startup images. iOS shows a white screen while an installed app opens
// unless the page links a startup image whose pixel size matches the device
// exactly, so one entry per device class. Sizes are CSS points, portrait.
// scripts/generate-pwa-icons.ts renders one PNG per entry into
// public/icons/splash/; the root layout links them from this list.
export interface AppleSplashScreen {
    width: number;
    height: number;
    ratio: number;
}

export const APPLE_SPLASH_SCREENS: AppleSplashScreen[] = [
    { width: 440, height: 956, ratio: 3 }, // iPhone 16 Pro Max
    { width: 402, height: 874, ratio: 3 }, // iPhone 16 Pro
    { width: 430, height: 932, ratio: 3 }, // iPhone 14 Pro Max, 15 Plus, 16 Plus
    { width: 393, height: 852, ratio: 3 }, // iPhone 14 Pro, 15, 16
    { width: 428, height: 926, ratio: 3 }, // iPhone 12 Pro Max, 13 Pro Max, 14 Plus
    { width: 390, height: 844, ratio: 3 }, // iPhone 12, 13, 14
    { width: 375, height: 812, ratio: 3 }, // iPhone X, XS, 11 Pro, 12 mini, 13 mini
    { width: 414, height: 896, ratio: 3 }, // iPhone XS Max, 11 Pro Max
    { width: 414, height: 896, ratio: 2 }, // iPhone XR, 11
    { width: 414, height: 736, ratio: 3 }, // iPhone 6+ to 8 Plus
    { width: 375, height: 667, ratio: 2 }, // iPhone 6 to 8, SE 2 and 3
    { width: 1024, height: 1366, ratio: 2 }, // iPad Pro 12.9
    { width: 834, height: 1194, ratio: 2 }, // iPad Pro 11
    { width: 820, height: 1180, ratio: 2 }, // iPad 10
    { width: 810, height: 1080, ratio: 2 }, // iPad 7 to 9
    { width: 744, height: 1133, ratio: 2 }, // iPad mini 6
    { width: 768, height: 1024, ratio: 2 }, // iPad 5, 6, mini 5, Air 2
];

export function appleSplashPath(screen: AppleSplashScreen): string {
    return `/icons/splash/${screen.width * screen.ratio}x${screen.height * screen.ratio}.png`;
}

/** The `appleWebApp.startupImage` entries for the root layout's metadata. */
export function appleStartupImages(): { url: string; media: string }[] {
    return APPLE_SPLASH_SCREENS.map((screen) => ({
        url: appleSplashPath(screen),
        media: `screen and (device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait)`,
    }));
}
