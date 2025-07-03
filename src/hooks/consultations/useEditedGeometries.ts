import { useState, useEffect } from 'react';

const LOCAL_STORAGE_KEY = 'opencouncil-edited-geometries';

export function useEditedGeometries() {
    const [savedGeometries, setSavedGeometries] = useState<Record<string, any>>({});

    // Load saved geometries from localStorage on mount
    useEffect(() => {
        const loadSavedGeometries = () => {
            try {
                const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
                
                // Only update state if the data actually changed (deep comparison)
                setSavedGeometries(prev => {
                    const hasChanged = JSON.stringify(prev) !== JSON.stringify(saved);
                    return hasChanged ? saved : prev;
                });
            } catch (error) {
                console.error('Error loading saved geometries:', error);
                setSavedGeometries({});
            }
        };

        loadSavedGeometries();

        // Listen for localStorage changes (from other tabs)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === LOCAL_STORAGE_KEY) {
                loadSavedGeometries();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        
        // Custom event for same-tab localStorage changes
        const handleCustomStorageChange = () => {
            loadSavedGeometries();
        };

        window.addEventListener('opencouncil-storage-change', handleCustomStorageChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('opencouncil-storage-change', handleCustomStorageChange);
        };
    }, []);

    const deleteSavedGeometry = (geometryId: string) => {
        try {
            const currentSaved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
            delete currentSaved[geometryId];
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentSaved));
            
            // IMMEDIATELY update local state to reflect the change
            setSavedGeometries(currentSaved);
            
            // Dispatch custom event to notify components of localStorage change
            window.dispatchEvent(new CustomEvent('opencouncil-storage-change'));
            
            console.log(`🗑️ Deleted saved geometry for ID: ${geometryId}`);
        } catch (error) {
            console.error('Error deleting saved geometry:', error);
        }
    };

    return { savedGeometries, deleteSavedGeometry };
} 