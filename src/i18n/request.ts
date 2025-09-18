import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import fs from 'fs';
import path from 'path';

/**
 * Dynamically loads all modular translation files from the messages directory
 * This allows for automatic discovery of new translation modules without code changes
 */
async function loadModularTranslations(locale: string): Promise<Record<string, any>> {
    const modularMessages: Record<string, any> = {};
    const localeDir = path.join(process.cwd(), 'messages', locale);
    
    try {
        // Check if the locale directory exists
        if (!fs.existsSync(localeDir)) {
            return modularMessages;
        }
        
        // Read all files in the locale directory
        const files = fs.readdirSync(localeDir);
        
        // Load each JSON file directly using fs.readFileSync
        for (const file of files) {
            if (file.endsWith('.json')) {
                const moduleName = file.replace('.json', '');
                try {
                    const filePath = path.join(localeDir, file);
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    const moduleData = JSON.parse(fileContent);
                    modularMessages[moduleName] = moduleData;
                } catch (error) {
                    console.warn(`Failed to load modular translation file ${file} for locale ${locale}:`, error);
                }
            }
        }
    } catch (error) {
        console.warn(`Failed to scan modular translations for locale ${locale}:`, error);
    }
    
    return modularMessages;
}

/**
 * Loads and merges translations from both monolithic JSON files and modular files
 * This allows for gradual migration from monolithic to modular translation structure
 */
async function loadTranslations(locale: string) {
    try {
        // Load the main JSON file (existing system)
        const mainMessages = (await import(`../../messages/${locale}.json`)).default;
        
        // Dynamically load all modular files
        const modularMessages = await loadModularTranslations(locale);
        
        // Merge modular messages into the main messages
        // This allows components to use both old and new translation patterns
        return {
            ...mainMessages,
            ...modularMessages
        };
    } catch (error) {
        console.error(`Failed to load translations for locale ${locale}:`, error);
        // Fallback to main JSON file only
        return (await import(`../../messages/${locale}.json`)).default;
    }
}

export default getRequestConfig(async ({ requestLocale }) => {
    // This typically corresponds to the `[locale]` segment
    let locale = await requestLocale;

    // Ensure that the incoming locale is valid
    if (!locale || !routing.locales.includes(locale as any)) {
        locale = routing.defaultLocale;
    }

    return {
        locale,
        messages: await loadTranslations(locale)
    };
});