"use client";

import { useEffect, useState, useRef } from "react";
import { RegulationData } from "./types";

interface DocumentNavigationProps {
    regulationData: RegulationData;
}

interface NavigationItem {
    id: string;
    type: 'chapter' | 'article';
    title: string;
    chapterTitle?: string; // For articles, show which chapter they belong to
}

export default function DocumentNavigation({ regulationData }: DocumentNavigationProps) {
    const [currentSection, setCurrentSection] = useState<string>("");
    const [navigationItems, setNavigationItems] = useState<NavigationItem[]>([]);
    const observerRef = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        // Build navigation items from regulation data
        const items: NavigationItem[] = [];

        regulationData.regulation
            .filter(item => item.type === 'chapter' && item.articles)
            .forEach(chapter => {
                // Add chapter
                items.push({
                    id: chapter.id,
                    type: 'chapter',
                    title: chapter.title || chapter.name || 'Untitled Chapter'
                });

                // Add articles
                chapter.articles?.forEach(article => {
                    items.push({
                        id: article.id,
                        type: 'article',
                        title: `Άρθρο ${article.num}: ${article.title}`,
                        chapterTitle: chapter.title || chapter.name
                    });
                });
            });

        setNavigationItems(items);
    }, [regulationData]);

    useEffect(() => {
        // Set up intersection observer
        const observer = new IntersectionObserver(
            (entries) => {
                let mostVisible = '';
                let maxVisibility = 0;

                entries.forEach(entry => {
                    if (entry.isIntersecting && entry.intersectionRatio > maxVisibility) {
                        maxVisibility = entry.intersectionRatio;
                        mostVisible = entry.target.id;
                    }
                });

                if (mostVisible) {
                    setCurrentSection(mostVisible);
                }
            },
            {
                threshold: [0.1, 0.3, 0.5, 0.7, 0.9],
                rootMargin: '-10% 0px -60% 0px' // Focus on the upper part of the viewport
            }
        );

        observerRef.current = observer;

        // Observe all chapter and article elements
        navigationItems.forEach(item => {
            const element = document.getElementById(item.id);
            if (element) {
                observer.observe(element);
            }
        });

        return () => {
            observer.disconnect();
        };
    }, [navigationItems]);

    if (navigationItems.length === 0) return null;

    const currentItem = navigationItems.find(item => item.id === currentSection);
    const currentChapter = currentItem?.type === 'article'
        ? navigationItems.find(item => item.type === 'chapter' && item.title === currentItem.chapterTitle)
        : currentItem?.type === 'chapter' ? currentItem : null;

    return (
        <div className="hidden xl:block fixed left-8 top-1/2 transform -translate-y-1/2 z-30 max-w-64">
            <div className="space-y-4">
                {currentChapter && (
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Τρεχον Κεφαλαιο
                        </p>
                        <p className="text-sm font-semibold text-foreground leading-tight">
                            {currentChapter.title}
                        </p>
                    </div>
                )}

                {currentItem?.type === 'article' && (
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Τρέχον Άρθρο
                        </p>
                        <p className="text-sm text-foreground leading-tight">
                            {currentItem.title}
                        </p>
                    </div>
                )}

                {!currentItem && (
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Διαβούλευση
                        </p>
                        <p className="text-sm text-foreground">
                            {regulationData.title}
                        </p>
                    </div>
                )}

                {/* Progress indicator */}
                <div className="flex items-center gap-2 mt-6">
                    <div className="flex-1 bg-muted rounded-full h-1">
                        <div
                            className="bg-primary rounded-full h-1 transition-all duration-300"
                            style={{
                                width: currentItem
                                    ? `${((navigationItems.findIndex(item => item.id === currentSection) + 1) / navigationItems.length * 100)}%`
                                    : '0%'
                            }}
                        />
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {currentItem
                            ? `${navigationItems.findIndex(item => item.id === currentSection) + 1}/${navigationItems.length}`
                            : '0/0'
                        }
                    </span>
                </div>
            </div>
        </div>
    );
} 